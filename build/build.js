// Build the Pages site: collect wishlist issues → derive MapData → encrypt → dist/.
// Logs ONLY counts. Never print titles, bodies, logins or the passphrase.
import { cpSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGh } from "../lib/gh.js";
import { encryptJson } from "../site/shared/crypto-box.js";
import { OWNER, WISHLIST_REPO, NEW_WISH_URL, REPO_URL } from "../site/shared/form-schema.js";
import { collect } from "./collect.js";
import { derive } from "./derive.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIN_PASSPHRASE = 10;
// Site-specific, public, stable salt: remembered keys survive rebuilds; changing the passphrase
// still changes the key. (16 bytes of SHA-256 over a fixed label.)
const SITE_SALT = createHash("sha256").update(`wishmap:${OWNER}:v1`).digest().subarray(0, 16).toString("base64");

function listFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

export async function assemble({ mapData, passphrase, outDir = join(ROOT, "dist"), iterations = 600000 }) {
  if (!passphrase || passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`passphrase missing or shorter than ${MIN_PASSPHRASE} characters`);
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(join(ROOT, "site"), outDir, { recursive: true }); // includes site/shared/
  const envelope = await encryptJson(mapData, passphrase, { iterations, salt: SITE_SALT });
  writeFileSync(join(outDir, "data.enc"), JSON.stringify(envelope));
  return { files: listFiles(outDir).map((f) => relative(outDir, f)) };
}

export async function main(env = process.env) {
  if (!env.WISHMAP_TOKEN) throw new Error("WISHMAP_TOKEN missing");
  const gh = createGh({ token: env.WISHMAP_TOKEN });
  const raw = await collect({ gh, owner: OWNER, repo: WISHLIST_REPO, boardNumber: 1 });
  const mapData = derive(raw, { now: new Date(), includeTest: env.INCLUDE_TEST === "1", newWishUrl: NEW_WISH_URL, repoUrl: REPO_URL });
  await assemble({ mapData, passphrase: env.MAP_PASSPHRASE });
  console.log(`wishes=${mapData.wishes.length} projects=${mapData.projects.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    // Only print messages we wrote ourselves; others (e.g. JSON errors) may quote wish text.
    const safe = /^(passphrase missing|WISHMAP_TOKEN missing)/.test(e.message || "") ? e.message : "";
    console.error(`build failed: ${e.name} ${e.status ?? ""} ${e.path ?? ""} ${safe}`);
    process.exit(1);
  });
}

// Local preview: serves site/ live (edits show on reload) plus data.enc made in memory from
// test/fixtures/mapdata.json (or an empty map with --empty), passphrase "test-passphrase".
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { encryptJson } from "../site/shared/crypto-box.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = join(ROOT, "site");
const PORT = Number(process.env.PORT || 5173);
const fixture = JSON.parse(readFileSync(join(ROOT, "test/fixtures/mapdata.json"), "utf8"));
const mapData = process.argv.includes("--empty") ? { ...fixture, wishes: [], projects: [], people: {} } : fixture;
const envelope = JSON.stringify(await encryptJson(mapData, "test-passphrase", { iterations: 1000 }));

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".enc": "application/json", ".txt": "text/plain; charset=utf-8" };
createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path === "/data.enc") {
    res.writeHead(200, { "content-type": TYPES[".enc"], "cache-control": "no-store" }).end(envelope);
    return;
  }
  let file = join(SITE, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!file.startsWith(SITE) || !existsSync(file)) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`serving site/ on http://localhost:${PORT} (passphrase: test-passphrase)`));

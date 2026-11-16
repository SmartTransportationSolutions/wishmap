import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assemble } from "../build/build.js";
import { decryptJson } from "../site/shared/crypto-box.js";

const SECRET_TITLE = "საიდუმლო-სურვილი-XYZ";
const mapData = { v: 1, generatedAt: "2026-11-16T00:00:00Z", wishes: [{ n: 1, title: SECRET_TITLE }], projects: [], people: { ana: { avatar: "" } } };
const PASS = "a long enough passphrase";

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test("assemble writes data.enc that decrypts to mapData", async () => {
  const out = mkdtempSync(join(tmpdir(), "wishmap-"));
  await assemble({ mapData, passphrase: PASS, outDir: out, iterations: 1000 });
  const env = JSON.parse(readFileSync(join(out, "data.enc"), "utf8"));
  assert.deepEqual(await decryptJson(env, PASS), mapData);
});

test("dist contains index.html + shared/crypto-box.js", async () => {
  const out = mkdtempSync(join(tmpdir(), "wishmap-"));
  const { files } = await assemble({ mapData, passphrase: PASS, outDir: out, iterations: 1000 });
  assert.ok(existsSync(join(out, "index.html")));
  assert.ok(existsSync(join(out, "shared", "crypto-box.js")));
  assert.ok(existsSync(join(out, "shared", "form-schema.js")));
  assert.ok(files.includes("data.enc"));
});

test("no plaintext title or login in any dist file", async () => {
  const out = mkdtempSync(join(tmpdir(), "wishmap-"));
  await assemble({ mapData, passphrase: PASS, outDir: out, iterations: 1000 });
  for (const f of walk(out)) {
    const text = readFileSync(f).toString("utf8");
    assert.ok(!text.includes(SECRET_TITLE), `plaintext title in ${f}`);
    assert.ok(!text.includes('"ana"'), `plaintext login in ${f}`);
  }
});

test("rebuilds reuse the site salt so remembered keys keep working", async () => {
  const a = mkdtempSync(join(tmpdir(), "wishmap-"));
  const b = mkdtempSync(join(tmpdir(), "wishmap-"));
  await assemble({ mapData, passphrase: PASS, outDir: a, iterations: 1000 });
  await assemble({ mapData, passphrase: PASS, outDir: b, iterations: 1000 });
  const ea = JSON.parse(readFileSync(join(a, "data.enc"), "utf8"));
  const eb = JSON.parse(readFileSync(join(b, "data.enc"), "utf8"));
  assert.equal(ea.salt, eb.salt);
  assert.notEqual(ea.iv, eb.iv);
});

test("passphrase is trimmed so a stray newline or space can't lock everyone out", async () => {
  const out = mkdtempSync(join(tmpdir(), "wishmap-"));
  await assemble({ mapData, passphrase: `  ${PASS}\n`, outDir: out, iterations: 1000 });
  const env = JSON.parse(readFileSync(join(out, "data.enc"), "utf8"));
  assert.deepEqual(await decryptJson(env, PASS), mapData);
});

test("refuses a missing or short passphrase", async () => {
  const out = mkdtempSync(join(tmpdir(), "wishmap-"));
  await assert.rejects(assemble({ mapData, passphrase: "", outDir: out, iterations: 1000 }), /passphrase/);
  await assert.rejects(assemble({ mapData, passphrase: "short", outDir: out, iterations: 1000 }), /passphrase/);
});

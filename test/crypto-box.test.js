import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptJson, decryptJson, deriveKey, decryptWithKey, exportRawKey, importRawKey } from "../site/shared/crypto-box.js";

const FAST = { iterations: 1000 };
const DATA = { v: 1, wishes: [{ n: 1, title: "ყოველკვირეული ანგარიშის ავტომატური გენერირება 📊" }] };

test("round-trip with Georgian text", async () => {
  const env = await encryptJson(DATA, "სწორი პაროლი", FAST);
  assert.deepEqual(await decryptJson(env, "სწორი პაროლი"), DATA);
});

test("large payload round-trips", async () => {
  const big = { items: Array.from({ length: 5000 }, (_, i) => ({ i, t: "ანგარიში".repeat(5) })) };
  const env = await encryptJson(big, "p", FAST);
  assert.deepEqual(await decryptJson(env, "p"), big);
});

test("wrong passphrase → bad-passphrase", async () => {
  const env = await encryptJson(DATA, "right", FAST);
  await assert.rejects(decryptJson(env, "wrong"), /bad-passphrase/);
});

test("tampered ct → bad-passphrase", async () => {
  const env = await encryptJson(DATA, "right", FAST);
  const bytes = Uint8Array.from(atob(env.ct), (c) => c.charCodeAt(0));
  bytes[0] ^= 1;
  const tampered = { ...env, ct: btoa(String.fromCharCode(...bytes)) };
  await assert.rejects(decryptJson(tampered, "right"), /bad-passphrase/);
});

test("fresh salt+iv each call", async () => {
  const a = await encryptJson(DATA, "p", FAST);
  const b = await encryptJson(DATA, "p", FAST);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

test("envelope fields + iter 600000", async () => {
  const env = await encryptJson({ x: 1 }, "p");
  assert.deepEqual(Object.keys(env).sort(), ["ct", "iter", "iv", "kdf", "salt", "v"]);
  assert.equal(env.v, 1);
  assert.equal(env.kdf, "PBKDF2-SHA256");
  assert.equal(env.iter, 600000);
  assert.equal(atob(env.salt).length, 16);
  assert.equal(atob(env.iv).length, 12);
  assert.ok(!JSON.stringify(env).includes("x\":1"));
});

test("non-extractable key cannot export", async () => {
  const env = await encryptJson(DATA, "p", FAST);
  const key = await deriveKey("p", env.salt, env.iter);
  assert.equal(key.extractable, false);
  await assert.rejects(exportRawKey(key));
  assert.deepEqual(await decryptWithKey(env, key), DATA);
});

test("session mode: extractable key round-trips through raw export", async () => {
  const env = await encryptJson(DATA, "p", FAST);
  const key = await deriveKey("p", env.salt, env.iter, { extractable: true });
  const raw = await exportRawKey(key);
  const again = await importRawKey(raw);
  assert.deepEqual(await decryptWithKey(env, again), DATA);
});

test("a fixed salt keeps a remembered key valid across rebuilds", async () => {
  const salt = btoa("0123456789abcdef");
  const first = await encryptJson(DATA, "p", { ...FAST, salt });
  const key = await deriveKey("p", first.salt, first.iter);
  const second = await encryptJson({ ...DATA, v: 2 }, "p", { ...FAST, salt });
  assert.equal(second.salt, salt);
  assert.notEqual(second.iv, first.iv);
  assert.deepEqual(await decryptWithKey(second, key), { ...DATA, v: 2 });
});

test("unknown envelope version rejected", async () => {
  const env = await encryptJson(DATA, "p", FAST);
  await assert.rejects(decryptJson({ ...env, v: 2 }, "p"), /bad-envelope/);
});

// Passphrase envelope shared by the builder (Node 24) and the browser.
// PBKDF2-SHA256 (600k iterations) → AES-256-GCM. Uses only WebCrypto + btoa/atob.

const subtle = globalThis.crypto.subtle;
const ITERATIONS = 600000;

function toB64(bytes) {
  const u8 = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

const random = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export async function deriveKey(passphrase, saltB64, iterations, { extractable = false } = {}) {
  const base = await subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}

// `salt` (base64) may be fixed per site so a key remembered in the browser stays valid across
// rebuilds; the IV is always fresh.
export async function encryptJson(obj, passphrase, { iterations = ITERATIONS, salt = toB64(random(16)) } = {}) {
  const ivBytes = random(12);
  const key = await deriveKey(passphrase, salt, iterations);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv: ivBytes }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { v: 1, kdf: "PBKDF2-SHA256", iter: iterations, salt, iv: toB64(ivBytes), ct: toB64(ct) };
}

export async function decryptWithKey(envelope, key) {
  if (!envelope || envelope.v !== 1) throw new Error("bad-envelope");
  let plain;
  try {
    plain = await subtle.decrypt({ name: "AES-GCM", iv: fromB64(envelope.iv) }, key, fromB64(envelope.ct));
  } catch {
    throw new Error("bad-passphrase");
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

export async function decryptJson(envelope, passphrase) {
  if (!envelope || envelope.v !== 1) throw new Error("bad-envelope");
  return decryptWithKey(envelope, await deriveKey(passphrase, envelope.salt, envelope.iter));
}

export async function exportRawKey(key) {
  return toB64(await subtle.exportKey("raw", key));
}

export async function importRawKey(b64) {
  return subtle.importKey("raw", fromB64(b64), { name: "AES-GCM" }, false, ["decrypt"]);
}

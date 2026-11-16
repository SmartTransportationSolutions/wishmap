// Unlocking the encrypted map data. Logic (initUnlock) is DOM-free and tested in Node;
// the browser helpers below wire it to the page.
import { deriveKey, decryptWithKey, exportRawKey, importRawKey } from "./shared/crypto-box.js";
import { T } from "./strings.ka.js";

const SESSION_KEY = "wishmap.key";
const DEVICE_KEY = "key";

async function attempt(fn) {
  try { return await fn(); } catch { return undefined; }
}

// Returns MapData, or null when there is no data.enc yet.
export async function initUnlock({ fetchEnvelope, storage, idb, ask }) {
  const envelope = await fetchEnvelope();
  if (!envelope) return null;

  // 1. Key remembered on this device (non-extractable, IndexedDB).
  const deviceKey = await attempt(() => idb.get(DEVICE_KEY));
  if (deviceKey) {
    const data = await attempt(() => decryptWithKey(envelope, deviceKey));
    if (data) return data;
    await attempt(() => idb.del(DEVICE_KEY)); // passphrase was rotated
  }

  // 2. Key kept for this browser session.
  const raw = await attempt(() => storage.getItem(SESSION_KEY));
  if (raw) {
    const data = await attempt(async () => decryptWithKey(envelope, await importRawKey(raw)));
    if (data) return data;
    await attempt(() => storage.removeItem(SESSION_KEY));
  }

  // 3. Ask until the passphrase is right.
  let error = null;
  for (;;) {
    const { passphrase, remember } = await ask(error);
    const key = await attempt(() => deriveKey(passphrase, envelope.salt, envelope.iter, { extractable: true }));
    const data = key && (await attempt(() => decryptWithKey(envelope, key)));
    if (!data) {
      error = T.wrongPassphrase;
      continue;
    }
    await attempt(async () => storage.setItem(SESSION_KEY, await exportRawKey(key)));
    if (remember) {
      await attempt(async () => idb.set(DEVICE_KEY, await deriveKey(passphrase, envelope.salt, envelope.iter)));
    }
    return data;
  }
}

// ---------- browser helpers ----------

export async function fetchEnvelope(url = "data.enc") {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function browserStorage() {
  try { return window.sessionStorage; } catch { return { getItem: () => null, setItem() {}, removeItem() {} }; }
}

export function openIdb(name = "wishmap") {
  const db = () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction("kv", mode);
      const r = fn(t.objectStore("kv"));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    });
  };
  return {
    get: (k) => tx("readonly", (s) => s.get(k)),
    set: (k, v) => tx("readwrite", (s) => s.put(v, k)),
    del: (k) => tx("readwrite", (s) => s.delete(k)),
  };
}

export async function forgetKeys(storage, idb) {
  await attempt(() => storage.removeItem(SESSION_KEY));
  await attempt(() => idb.del(DEVICE_KEY));
}

const LOCK_ICON = `<svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>`;

// Renders the passphrase card and returns an `ask(error)` function for initUnlock.
export function createAskForm(root) {
  return (error) =>
    new Promise((resolve) => {
      root.innerHTML = "";
      const card = document.createElement("form");
      card.className = "unlock card";
      card.innerHTML = `
        <div class="unlock-icon">${LOCK_ICON}</div>
        <h1></h1>
        <p class="muted"></p>
        <label class="field"><span></span><input type="password" name="pass" autocomplete="current-password" required></label>
        <label class="check"><input type="checkbox" name="remember"><span></span></label>
        <p class="hint"></p>
        <p class="error" role="alert"></p>
        <button class="btn primary" type="submit"></button>`;
      card.querySelector("h1").textContent = T.unlockTitle;
      card.querySelector(".muted").textContent = T.unlockBody;
      card.querySelector(".field span").textContent = T.passphrase;
      card.querySelector(".check span").textContent = T.remember;
      card.querySelector(".hint").textContent = T.rememberHint;
      card.querySelector(".error").textContent = error || "";
      const btn = card.querySelector("button");
      btn.textContent = T.unlock;
      card.addEventListener("submit", (e) => {
        e.preventDefault();
        btn.disabled = true;
        btn.textContent = T.unlocking;
        resolve({ passphrase: card.pass.value, remember: card.remember.checked });
      });
      root.append(card);
      card.pass.focus();
    });
}

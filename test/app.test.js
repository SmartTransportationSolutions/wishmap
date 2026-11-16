import { test } from "node:test";
import assert from "node:assert/strict";
import { createState, relativeTime } from "../site/app.js";
import { initUnlock } from "../site/unlock.js";
import { T } from "../site/strings.ka.js";
import { encryptJson } from "../site/shared/crypto-box.js";

const DATA = {
  v: 1, generatedAt: "2026-11-16T12:00:00Z", newWishUrl: "NEW", repoUrl: "REPO",
  wishes: [
    { n: 1, status: "idea" }, { n: 2, status: "idea" }, { n: 3, status: "in-progress" }, { n: 4, status: "wont-do" },
  ],
  projects: [], people: {},
};
const PASS = "სწორი პაროლი 2026";

function fakeStorage({ throws = false } = {}) {
  const m = new Map();
  return {
    m,
    getItem: (k) => { if (throws) throw new Error("blocked"); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (throws) throw new Error("blocked"); m.set(k, v); },
    removeItem: (k) => { if (throws) throw new Error("blocked"); m.delete(k); },
  };
}
function fakeIdb({ throws = false } = {}) {
  const m = new Map();
  return {
    m,
    get: async (k) => { if (throws) throw new Error("no idb"); return m.get(k); },
    set: async (k, v) => { if (throws) throw new Error("no idb"); m.set(k, v); },
    del: async (k) => { if (throws) throw new Error("no idb"); m.delete(k); },
  };
}
const asker = (answers) => {
  const seen = [];
  return { seen, ask: async (err) => { seen.push(err); return answers.shift(); } };
};
const envelope = () => encryptJson(DATA, PASS, { iterations: 1000, salt: btoa("0123456789abcdef") });

test("createState empty → emptyState true", () => {
  const s = createState({ ...DATA, wishes: [] });
  assert.equal(s.emptyState, true);
  assert.equal(s.noData, false);
});

test("fetchEnvelope 404 → noData state", async () => {
  const data = await initUnlock({ fetchEnvelope: async () => null, storage: fakeStorage(), idb: fakeIdb(), ask: async () => assert.fail("asked") });
  assert.equal(data, null);
  const s = createState(data);
  assert.equal(s.noData, true);
  assert.equal(s.emptyState, true);
});

test("createState counts by status and default filters", () => {
  const s = createState(DATA);
  assert.deepEqual(s.counts, { idea: 2, planned: 0, "in-progress": 1, done: 0, "wont-do": 1 });
  assert.equal(s.filters.showWontDo, false);
  assert.equal(s.filters.q, "");
  assert.equal(s.tab, "map");
});

test("relativeTime ka", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  assert.equal(relativeTime("2026-11-16T11:59:40Z", now), T.justNow);
  assert.equal(relativeTime("2026-11-16T11:55:00Z", now), "5 წუთის წინ");
  assert.equal(relativeTime("2026-11-16T09:00:00Z", now), "3 საათის წინ");
  assert.equal(relativeTime("2026-11-14T12:00:00Z", now), "2 დღის წინ");
});

test("unlock flow with fake storage: wrong → right + remember", async () => {
  const env = await envelope();
  const storage = fakeStorage();
  const idb = fakeIdb();
  const a = asker([{ passphrase: "wrong", remember: false }, { passphrase: PASS, remember: true }]);
  const data = await initUnlock({ fetchEnvelope: async () => env, storage, idb, ask: a.ask });
  assert.deepEqual(data, DATA);
  assert.deepEqual(a.seen, [null, T.wrongPassphrase]);
  assert.equal(idb.m.get("key").extractable, false);
  assert.ok(storage.m.get("wishmap.key"));

  // Same tab later: session key works, no prompt.
  const again = await initUnlock({ fetchEnvelope: async () => env, storage, idb: fakeIdb(), ask: async () => assert.fail("asked") });
  assert.deepEqual(again, DATA);
  // New tab, remembered device key works, no prompt.
  const remembered = await initUnlock({ fetchEnvelope: async () => env, storage: fakeStorage(), idb, ask: async () => assert.fail("asked") });
  assert.deepEqual(remembered, DATA);
});

test("stale remembered key (passphrase rotated) is dropped and the user is asked", async () => {
  const env = await envelope();
  const idb = fakeIdb();
  const old = await encryptJson(DATA, "old passphrase!", { iterations: 1000, salt: env.salt });
  await initUnlock({ fetchEnvelope: async () => old, storage: fakeStorage(), idb, ask: asker([{ passphrase: "old passphrase!", remember: true }]).ask });
  const a = asker([{ passphrase: PASS, remember: false }]);
  const data = await initUnlock({ fetchEnvelope: async () => env, storage: fakeStorage(), idb, ask: a.ask });
  assert.deepEqual(data, DATA);
  assert.equal(a.seen.length, 1);
  assert.equal(idb.m.has("key"), false);
});

test("typed passphrase is trimmed (pasted trailing space)", async () => {
  const env = await envelope();
  const a = asker([{ passphrase: ` ${PASS}  `, remember: false }]);
  const data = await initUnlock({ fetchEnvelope: async () => env, storage: fakeStorage(), idb: fakeIdb(), ask: a.ask });
  assert.deepEqual(data, DATA);
  assert.equal(a.seen.length, 1);
});

test("storage throwing doesn't break unlock", async () => {
  const env = await envelope();
  const data = await initUnlock({
    fetchEnvelope: async () => env, storage: fakeStorage({ throws: true }), idb: fakeIdb({ throws: true }),
    ask: asker([{ passphrase: PASS, remember: true }]).ask,
  });
  assert.deepEqual(data, DATA);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collect, ISSUES_QUERY } from "../build/collect.js";

const page = (n) => JSON.parse(readFileSync(new URL(`./fixtures/graphql-page-${n}.json`, import.meta.url), "utf8"));

function fakeGh() {
  const calls = [];
  return {
    calls,
    async graphql(query, variables) {
      calls.push({ query, variables });
      return variables.cursor ? page(2) : page(1);
    },
  };
}

const OWNER = "SmartTransportationSolutions";
const run = async () => {
  const gh = fakeGh();
  const out = await collect({ gh, owner: OWNER, repo: "wishlist" });
  return { gh, out, by: Object.fromEntries(out.map((i) => [i.n, i])) };
};

test("collect paginates", async () => {
  const { gh, out } = await run();
  assert.equal(out.length, 3);
  assert.equal(gh.calls.length, 2);
  assert.equal(gh.calls[0].variables.cursor, null);
  assert.equal(gh.calls[1].variables.cursor, "c1");
  assert.equal(gh.calls[0].query, ISSUES_QUERY);
  assert.deepEqual(gh.calls[0].variables.owner, OWNER);
});

test("maps fields", async () => {
  const { by } = await run();
  assert.deepEqual(by[1].author, { login: "ana", avatar: "https://a/ana" });
  assert.deepEqual(by[1].assignees, [{ login: "gio", avatar: "https://a/gio" }]);
  assert.deepEqual(by[1].thumbsUp, [{ login: "nino", avatar: "https://a/nino" }]);
  assert.deepEqual(by[1].labels, ["wish", "area:reporting"]);
  assert.equal(by[1].parent, 3);
  assert.deepEqual(by[1].blockedBy, [2]);
  assert.deepEqual(by[3].subIssues, [1]);
  assert.equal(by[1].state, "open");
});

test("maps stateReason lowercase", async () => {
  const { by } = await run();
  assert.equal(by[2].state, "closed");
  assert.equal(by[2].stateReason, "duplicate");
  assert.equal(by[1].stateReason, null);
});

test("boardStatus only from board #1 of this org", async () => {
  const { by } = await run();
  assert.equal(by[1].boardStatus, "In Progress");
  assert.equal(by[2].boardStatus, null); // board #1 of another org
  assert.equal(by[3].boardStatus, ""); // on board, no Status set
});

test("botComments filtered to BOT_LOGINS", async () => {
  const { by } = await run();
  assert.deepEqual(by[1].botComments, [{ author: { login: "github-actions" }, body: "bot says\n<!-- wishmap:related -->", id: 11 }]);
});

test("deleted author → null", async () => {
  const { by } = await run();
  assert.equal(by[2].author, null);
});

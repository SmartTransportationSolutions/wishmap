import { test } from "node:test";
import assert from "node:assert/strict";
import { handleComment } from "../bot/on-command.js";
import { GhError } from "../lib/gh.js";
import { marker } from "../lib/markers.js";
import { fakeGh, posts } from "./helpers/fake-gh.js";

const wishIssue = (n, extra = {}) => ({
  number: n, id: 1000 + n, node_id: `N${n}`, state: "open", state_reason: null,
  labels: [{ name: "wish" }], assignees: [], ...extra,
});

function world({ issues = {}, needs = {}, comments = {}, role = "read" } = {}) {
  const all = { 5: wishIssue(5), 7: wishIssue(7), 8: wishIssue(8), 9: wishIssue(9, { labels: [{ name: "project" }] }), ...issues };
  return fakeGh([
    ["GET", /\/collaborators\/[^/]+\/permission$/, () => ({ role_name: role })],
    ["GET", /\/issues\/(\d+)\/dependencies\/blocked_by/, (m) => (needs[m[1]] || []).map((n) => ({ number: n, id: 1000 + n }))],
    ["GET", /\/issues\/(\d+)\/comments/, (m) => comments[m[1]] || []],
    ["GET", /\/issues\/(\d+)$/, (m) => {
      if (!all[m[1]]) throw new GhError({ status: 404, message: "nf", path: "x" });
      return all[m[1]];
    }],
    ["DELETE", /\/assignees$/, () => ({ assignees: [] })],
    ["GRAPHQL", /closeIssue/, () => ({ closeIssue: { issue: { number: 5 } } })],
  ]);
}

const comment = (body, login = "ana") => ({ id: 555, body, user: { login, type: "User" } });
const run = (g, body, { issue = wishIssue(5), login, dispatch = async () => {} } = {}) =>
  handleComment({ gh: g, owner: "o", repo: "r", issue, comment: comment(body, login), dispatch });

const reactions = (g) => posts(g, /\/comments\/555\/reactions$/).map((c) => c.body.content);
const replies = (g) => posts(g, /\/issues\/5\/comments$/).map((c) => c.body.body);

test("same-as closes as duplicate + note", async () => {
  const g = world();
  const res = await run(g, "/same-as #7");
  assert.deepEqual(res.results, [{ cmd: "same-as", ok: true, n: 7 }]);
  const gq = g.calls.find((c) => c.method === "GRAPHQL");
  assert.deepEqual(gq.variables, { issueId: "N5", dupId: "N7" });
  assert.ok(replies(g).some((b) => b.endsWith(marker("same-as", 7))));
  assert.deepEqual(reactions(g), ["+1"]);
});

test("same-as refuses loop", async () => {
  const g = world({ comments: { 7: [{ user: { login: "github-actions[bot]" }, body: `x\n${marker("same-as", 5)}`, id: 1 }] } });
  const res = await run(g, "/same-as #7");
  assert.equal(res.results[0].code, "loop");
  assert.ok(!g.calls.some((c) => c.method === "GRAPHQL"));
});

test("same-as refuses self, missing, non-wish", async () => {
  const g = world();
  const res = await run(g, "/same-as #5\n/same-as #404\n/same-as #9");
  assert.deepEqual(res.results.map((r) => r.code), ["self", "not-found", "not-a-wish"]);
  assert.deepEqual(reactions(g), ["confused"]);
  assert.equal(replies(g).length, 1);
});

test("not-same reopens when merged into that wish", async () => {
  const g = world({ comments: { 5: [{ user: { login: "github-actions[bot]" }, body: `x\n${marker("same-as", 7)}`, id: 1 }] } });
  await run(g, "/not-same #7", { issue: wishIssue(5, { state: "closed", state_reason: "duplicate" }) });
  const reopen = g.calls.find((c) => c.method === "PATCH" && /\/issues\/5$/.test(c.path));
  assert.deepEqual(reopen.body, { state: "open" });
  assert.ok(replies(g).some((b) => b.endsWith(marker("not-same", 7))));
});

test("needs adds dependency; refuses loop", async () => {
  const g = world({ needs: { 7: [8], 8: [] } });
  await run(g, "/needs #7");
  const add = posts(g, /\/issues\/5\/dependencies\/blocked_by$/);
  assert.deepEqual(add[0].body, { issue_id: 1007 });

  const g2 = world({ needs: { 7: [5] } });
  const res = await run(g2, "/needs #7");
  assert.equal(res.results[0].code, "loop");
  assert.equal(posts(g2, /dependencies/).length, 0);
});

test("unneed removes dependency", async () => {
  const g = world();
  await run(g, "/unneed #7");
  assert.ok(g.calls.some((c) => c.method === "DELETE" && c.path.endsWith("/issues/5/dependencies/blocked_by/1007")));
});

test("status by reader → not-lead error", async () => {
  const g = world({ role: "read" });
  const res = await run(g, "/status done");
  assert.equal(res.results[0].code, "not-lead");
  assert.ok(!g.calls.some((c) => c.method === "PATCH"));
});

test("status done by lead closes completed", async () => {
  const g = world({ role: "triage" });
  await run(g, "/status done");
  const p = g.calls.find((c) => c.method === "PATCH" && /\/issues\/5$/.test(c.path));
  assert.deepEqual(p.body, { state: "closed", state_reason: "completed" });
});

test("status planned by lead sets label; bad value refused", async () => {
  const g = world({ role: "admin" });
  const res = await run(g, "/status planned\n/status maybe");
  assert.ok(posts(g, /\/issues\/5\/labels$/).some((c) => c.body.labels.includes("status:planned")));
  assert.equal(res.results[1].code, "bad-status");
});

test("claim/unclaim", async () => {
  const g = world();
  await run(g, "/claim", { login: "gio" });
  assert.deepEqual(posts(g, /\/issues\/5\/assignees$/)[0].body, { assignees: ["gio"] });
  assert.ok(posts(g, /\/issues\/5\/labels$/)[0].body.labels.includes("status:in-progress"));

  const g2 = world();
  await run(g2, "/unclaim", { login: "gio" });
  const dels = g2.calls.filter((c) => c.method === "DELETE").map((c) => decodeURIComponent(c.path));
  assert.ok(dels.includes("/repos/o/r/issues/5/assignees"));
  assert.ok(dels.includes("/repos/o/r/issues/5/labels/status:in-progress"));
});

test("errors produce exactly one reply", async () => {
  const g = world();
  await run(g, "/sameas 3\n/needs #404\n/claim");
  const r = replies(g);
  assert.equal(r.length, 1);
  assert.ok(r[0].includes("/sameas 3") && r[0].includes("#404"));
  assert.deepEqual(reactions(g), ["confused"]);
});

test("success → +1 reaction + dispatch", async () => {
  const g = world();
  let dispatched = 0;
  await run(g, "/claim", { dispatch: async () => { dispatched++; } });
  assert.deepEqual(reactions(g), ["+1"]);
  assert.equal(dispatched, 1);
});

test("no dispatch when every command failed", async () => {
  const g = world();
  let dispatched = 0;
  await run(g, "/same-as #404", { dispatch: async () => { dispatched++; } });
  assert.equal(dispatched, 0);
});

test("commands on project issue ignored", async () => {
  const g = world();
  const res = await run(g, "/same-as #7", { issue: wishIssue(9, { labels: [{ name: "project" }] }) });
  assert.deepEqual(res.results, []);
  assert.equal(g.calls.length, 0);
});

test("bot comments ignored", async () => {
  const g = world();
  const res = await handleComment({
    gh: g, owner: "o", repo: "r", issue: wishIssue(5),
    comment: { id: 1, body: "/claim", user: { login: "github-actions[bot]", type: "Bot" } }, dispatch: async () => {},
  });
  assert.deepEqual(res.results, []);
});

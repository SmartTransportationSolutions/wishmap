import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommands, isLead, wouldCreateLoop } from "../lib/commands.js";

const cmds = (body) => parseCommands(body).map(({ cmd, arg }) => [cmd, arg]);

test("parseCommands table", () => {
  assert.deepEqual(cmds("/same-as #12"), [["same-as", 12]]);
  assert.deepEqual(cmds("/same-as 12"), [["same-as", 12]]);
  assert.deepEqual(cmds("  /NEEDS #4 thanks!"), [["needs", 4]]);
  assert.deepEqual(cmds("/needs #4\n/claim\n/status Planned"), [["needs", 4], ["claim", null], ["status", "planned"]]);
  assert.deepEqual(cmds("hello\n/unneed #3\nbye"), [["unneed", 3]]);
  assert.deepEqual(cmds("/sameas 3"), [["unknown", null]]);
  assert.equal(parseCommands("/sameas 3")[0].raw, "/sameas 3");
  assert.deepEqual(cmds("/same-as"), [["unknown", null]]);
  assert.deepEqual(cmds("> /same-as #12"), []);
  assert.deepEqual(cmds("```\n/same-as #12\n```\n/claim"), [["claim", null]]);
  assert.deepEqual(cmds("~~~\n/needs #1\n~~~"), []);
  assert.deepEqual(cmds("see /same-as #12 inline"), []);
  assert.deepEqual(cmds("/Users/mat/file.txt"), []);
  assert.deepEqual(cmds("/not-same #7\r\n/unclaim"), [["not-same", 7], ["unclaim", null]]);
  assert.deepEqual(cmds(""), []);
  assert.deepEqual(cmds(null), []);
});

test("isLead", () => {
  for (const r of ["triage", "write", "maintain", "admin"]) assert.equal(isLead(r), true, r);
  for (const r of ["read", "none", undefined, null]) assert.equal(isLead(r), false, String(r));
});

test("wouldCreateLoop cases", async () => {
  const graph = { 1: [2], 2: [3], 3: [], 4: [] };
  const getNeeds = async (n) => graph[n] ?? [];
  assert.equal(await wouldCreateLoop(3, 1, getNeeds), true); // 3 needs 1 while 1→2→3
  assert.equal(await wouldCreateLoop(2, 1, getNeeds), true); // direct back-edge
  assert.equal(await wouldCreateLoop(1, 4, getNeeds), false);
  assert.equal(await wouldCreateLoop(5, 5, getNeeds), true); // self
});

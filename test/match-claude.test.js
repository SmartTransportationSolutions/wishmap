import { test } from "node:test";
import assert from "node:assert/strict";
import { matchWithClaude, makeClaudeMatcher, MODEL } from "../lib/match-claude.js";

const wish = { n: 5, title: "ანგარიშები", text: "ყოველკვირეული ანგარიშის ავტომატური გენერირება" };
const candidates = [
  { n: 2, title: "ანგარიშის ბოტი", text: "ანგარიშების ავტომატურად შექმნა" },
  { n: 3, title: "ექსპორტი", text: "მონაცემების ექსპორტი" },
  { n: 4, title: "a", text: "a" },
  { n: 6, title: "b", text: "b" },
];

function fakeClient(response) {
  const calls = [];
  return { calls, beta: { messages: { create: async (req) => { calls.push(req); return response; } } } };
}
const reply = (matches, stop_reason = "end_turn") => ({
  stop_reason,
  content: [{ type: "text", text: JSON.stringify({ matches }) }],
});

test("parses structured output", async () => {
  const client = fakeClient(reply([{ n: 2, relation: "same-as", reason: "იგივე ანგარიში" }, { n: 3, relation: "needs", reason: "ექსპორტი სჭირდება" }]));
  const out = await matchWithClaude({ wish, candidates, client });
  assert.deepEqual(out, [
    { n: 2, relation: "same-as", reason: "იგივე ანგარიში" },
    { n: 3, relation: "needs", reason: "ექსპორტი სჭირდება" },
  ]);
  const req = client.calls[0];
  assert.equal(req.model, MODEL);
  assert.equal(MODEL, "claude-opus-5-5");
  assert.equal(req.output_config.format.type, "json_schema");
  assert.equal(req.fallbacks, "default");
  assert.ok(req.betas.includes("server-side-fallback-2026-07-01"));
  assert.ok(JSON.stringify(req.messages).includes("#2"));
});

test("drops unknown n and the wish itself, dedupes", async () => {
  const client = fakeClient(reply([
    { n: 99, relation: "same-as", reason: "x" },
    { n: 5, relation: "same-as", reason: "x" },
    { n: 2, relation: "related", reason: "x" },
    { n: 2, relation: "needs", reason: "y" },
  ]));
  const out = await matchWithClaude({ wish, candidates, client });
  assert.deepEqual(out.map((m) => m.n), [2]);
});

test("caps at 3 and rejects bad relation", async () => {
  const client = fakeClient(reply([
    { n: 2, relation: "related", reason: "a" },
    { n: 3, relation: "bogus", reason: "b" },
    { n: 4, relation: "related", reason: "c" },
    { n: 6, relation: "related", reason: "d" },
    { n: 3, relation: "related", reason: "e" },
  ]));
  const out = await matchWithClaude({ wish, candidates, client });
  assert.equal(out.length, 3);
  assert.ok(out.every((m) => ["same-as", "needs", "related"].includes(m.relation)));
});

test("refusal stop_reason → []", async () => {
  const client = fakeClient({ stop_reason: "refusal", content: [] });
  assert.deepEqual(await matchWithClaude({ wish, candidates, client }), []);
});

test("unparseable output throws (so the trigram fallback runs)", async () => {
  const client = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] });
  await assert.rejects(matchWithClaude({ wish, candidates, client }));
});

test("no candidates → no API call", async () => {
  const client = fakeClient(reply([]));
  assert.deepEqual(await matchWithClaude({ wish, candidates: [], client }), []);
  assert.equal(client.calls.length, 0);
});

test("makeClaudeMatcher respects the exclude set", async () => {
  const client = fakeClient(reply([{ n: 2, relation: "same-as", reason: "x" }]));
  const matcher = await makeClaudeMatcher("key", { client });
  const out = await matcher(wish, candidates, new Set([2]));
  assert.ok(!JSON.stringify(client.calls[0].messages).includes("#2 "));
  assert.deepEqual(out, []);
});

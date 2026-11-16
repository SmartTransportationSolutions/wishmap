import { test } from "node:test";
import assert from "node:assert/strict";
import { handleWish, trigramMatcher, withFallback } from "../bot/on-wish.js";
import { dispatchRebuild } from "../bot/dispatch.js";
import { FIELDS, AREAS, TIMES, STARTED } from "../site/shared/form-schema.js";
import { marker } from "../lib/markers.js";
import { fakeGh, posts, patches } from "./helpers/fake-gh.js";

const label = (id) => FIELDS.find((f) => f.id === id).label;
const formBody = ({ problem, area = "reporting", time = "1-5h", started = STARTED.no }) =>
  [
    `### ${label("problem")}\n\n${problem}`,
    `### ${label("done")}\n\nავტომატურად`,
    `### ${label("area")}\n\n${AREAS.find((a) => a.slug === area).label}`,
    `### ${label("time")}\n\n${TIMES.find((t) => t.slug === time).label}`,
    `### ${label("tools")}\n\n_No response_`,
    `### ${label("started")}\n\n${started}`,
  ].join("\n\n");

const A = "ყოველკვირეული ანგარიშის ავტომატური გენერირება";
const B = "ანგარიშების ავტომატურად შექმნა ყოველ კვირას";
const C = "პარკირების მონაცემების GIS რუკაზე დატანა";

const openWishes = [
  { number: 5, title: "[სურვილი] ანგარიშები", body: formBody({ problem: A }), labels: [{ name: "wish" }] },
  { number: 2, title: "ანგარიშის ბოტი", body: formBody({ problem: B }), labels: [{ name: "wish" }] },
  { number: 3, title: "პარკირება", body: formBody({ problem: C }), labels: [{ name: "wish" }] },
];

const issue = (over = {}) => ({
  number: 5,
  title: "[სურვილი] ანგარიშები",
  body: formBody({ problem: A }),
  labels: [{ name: "wish" }],
  user: { login: "ana" },
  ...over,
});

function gh({ comments = [], wishes = openWishes } = {}) {
  return fakeGh([
    ["GET", /\/issues\?labels=wish&state=open/, () => wishes],
    ["GET", /\/issues\/\d+\/comments/, () => comments],
  ]);
}

test("opened sets labels", async () => {
  const g = gh({ wishes: [] });
  const res = await handleWish({ gh: g, owner: "o", repo: "r", action: "opened", issue: issue(), matcher: trigramMatcher });
  const add = posts(g, /\/issues\/5\/labels$/);
  assert.equal(add.length, 1);
  assert.deepEqual(add[0].body.labels.sort(), ["area:reporting", "time:1-5h"]);
  assert.deepEqual(res.labelsSet.sort(), ["area:reporting", "time:1-5h"]);
  assert.equal(posts(g, /assignees/).length, 0);
});

test("started → assign + status label", async () => {
  const g = gh({ wishes: [] });
  await handleWish({
    gh: g, owner: "o", repo: "r", action: "opened",
    issue: issue({ body: formBody({ problem: A, started: STARTED.yes }) }), matcher: trigramMatcher,
  });
  assert.deepEqual(posts(g, /\/issues\/5\/assignees$/)[0].body, { assignees: ["ana"] });
  assert.ok(posts(g, /\/issues\/5\/labels$/)[0].body.labels.includes("status:in-progress"));
});

test("comments when related found", async () => {
  const g = gh();
  const res = await handleWish({ gh: g, owner: "o", repo: "r", action: "opened", issue: issue(), matcher: trigramMatcher });
  const c = posts(g, /\/issues\/5\/comments$/);
  assert.equal(c.length, 1);
  assert.ok(c[0].body.body.includes("#2"));
  assert.ok(!c[0].body.body.includes("#3"));
  assert.ok(!c[0].body.body.includes("#5 "));
  assert.equal(res.commented, "created");
});

test("no comment when none found", async () => {
  const g = gh({ wishes: [openWishes[0], openWishes[2]] });
  const res = await handleWish({ gh: g, owner: "o", repo: "r", action: "opened", issue: issue(), matcher: trigramMatcher });
  assert.equal(posts(g, /\/comments$/).length, 0);
  assert.equal(res.commented, null);
});

test("edited updates existing comment, never creates a second", async () => {
  const existing = [{ id: 77, user: { login: "github-actions[bot]" }, body: `old\n${marker("related")}` }];
  const g = gh({ comments: existing });
  const res = await handleWish({ gh: g, owner: "o", repo: "r", action: "edited", issue: issue(), matcher: trigramMatcher });
  assert.equal(posts(g, /\/comments$/).length, 0);
  assert.equal(patches(g, /\/issues\/comments\/77$/).length, 1);
  assert.equal(res.commented, "updated");
});

test("edited with no matches turns existing comment into 'none now'", async () => {
  const existing = [{ id: 77, user: { login: "github-actions[bot]" }, body: `old\n${marker("related")}` }];
  const g = gh({ comments: existing, wishes: [openWishes[0]] });
  await handleWish({ gh: g, owner: "o", repo: "r", action: "edited", issue: issue(), matcher: trigramMatcher });
  const p = patches(g, /\/issues\/comments\/77$/);
  assert.equal(p.length, 1);
  assert.ok(p[0].body.body.includes("✅"));
});

test("edited replaces area/time labels", async () => {
  const g = gh({ wishes: [] });
  await handleWish({
    gh: g, owner: "o", repo: "r", action: "edited",
    issue: issue({ labels: [{ name: "wish" }, { name: "area:gis" }, { name: "time:1-5h" }] }), matcher: trigramMatcher,
  });
  const del = g.calls.filter((c) => c.method === "DELETE").map((c) => decodeURIComponent(c.path));
  assert.deepEqual(del, ["/repos/o/r/issues/5/labels/area:gis"]);
  assert.deepEqual(posts(g, /\/labels$/)[0].body.labels, ["area:reporting"]);
});

test("ignores non-wish", async () => {
  const g = gh();
  const res = await handleWish({
    gh: g, owner: "o", repo: "r", action: "opened", issue: issue({ labels: [{ name: "project" }] }), matcher: trigramMatcher,
  });
  assert.equal(g.calls.length, 0);
  assert.equal(res.skipped, true);
});

test("handleWish on free-text body", async () => {
  const g = gh({ wishes: [] });
  const res = await handleWish({
    gh: g, owner: "o", repo: "r", action: "opened", issue: issue({ body: "უბრალო ტექსტი" }), matcher: trigramMatcher,
  });
  assert.deepEqual(res.labelsSet, []);
  assert.equal(posts(g, /\/labels$/).length, 0);
});

test("notSame pairs excluded", async () => {
  const comments = [{ id: 9, user: { login: "github-actions[bot]" }, body: marker("not-same", 2) }];
  const g = gh({ comments });
  const res = await handleWish({ gh: g, owner: "o", repo: "r", action: "opened", issue: issue(), matcher: trigramMatcher });
  assert.equal(res.commented, null);
});

test("withFallback uses fallback when primary throws", async () => {
  const logs = [];
  const m = withFallback(async () => { throw new Error("boom"); }, async () => [{ n: 1 }], (s) => logs.push(s));
  assert.deepEqual(await m(), [{ n: 1 }]);
  assert.deepEqual(logs, ["claude matcher failed; using trigram"]);
});

test("dispatchRebuild posts nonce-only payload to wishmap", async () => {
  const g = fakeGh();
  await dispatchRebuild({ gh: g, owner: "o" });
  const [call] = g.calls;
  assert.equal(call.path, "/repos/o/wishmap/dispatches");
  assert.equal(call.body.event_type, "rebuild");
  assert.deepEqual(Object.keys(call.body.client_payload), ["nonce"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { derive, resolveMerges, deriveStatus, demand } from "../build/derive.js";
import { marker } from "../lib/markers.js";
import { FIELDS, AREAS } from "../site/shared/form-schema.js";

const now = new Date("2026-11-16T12:00:00Z");
const opts = { now, newWishUrl: "NEW", repoUrl: "REPO" };
const who = (login) => ({ login, avatar: `https://a/${login}` });
const label = (id) => FIELDS.find((f) => f.id === id).label;

function raw(n, over = {}) {
  return {
    n, id: `I_${n}`, title: `[სურვილი] wish ${n}`,
    body: `### ${label("problem")}\n\nproblem ${n}\n\n### ${label("area")}\n\n${AREAS[0].label}`,
    state: "open", stateReason: null, url: `https://x/${n}`, createdAt: "2026-11-01T00:00:00Z",
    author: who(`u${n}`), assignees: [], labels: ["wish"], thumbsUp: [], parent: null, subIssues: [],
    blockedBy: [], botComments: [], boardStatus: null, ...over,
  };
}
const dupOf = (n, target, over = {}) =>
  raw(n, { state: "closed", stateReason: "duplicate", botComments: [{ author: { login: "github-actions" }, body: `x\n${marker("same-as", target)}`, id: n }], ...over });
const project = (n, over = {}) => raw(n, { labels: ["project"], title: `Project ${n}`, ...over });

test("derive([]) → empty map data", () => {
  assert.deepEqual(derive([], opts), {
    v: 1, generatedAt: now.toISOString(), newWishUrl: "NEW", repoUrl: "REPO", wishes: [], projects: [], people: {},
  });
});

test("wish fields come from the form and title prefix is stripped", () => {
  const { wishes } = derive([raw(1, { assignees: [who("gio")] })], opts);
  assert.deepEqual(wishes[0], {
    n: 1, title: "wish 1", url: "https://x/1", problem: "problem 1", done: "", tools: "",
    area: AREAS[0].slug, time: null, status: "idea", owner: "gio", people: ["u1"],
    mergedFrom: [], needs: [], neededBy: [], project: null, createdAt: "2026-11-01T00:00:00Z",
  });
});

test("status table", () => {
  const P = project(50, { boardStatus: "To Do", subIssues: [] });
  const cases = [
    [raw(1, { state: "closed", stateReason: "completed" }), "done"],
    [raw(2, { state: "closed", stateReason: null }), "done"],
    [raw(3, { state: "closed", stateReason: "not_planned" }), "wont-do"],
    [raw(4, { parent: 50 }), "planned", "To Do"],
    [raw(5, { parent: 50 }), "in-progress", "In Progress"],
    [raw(6, { parent: 50 }), "in-progress", "In Review"],
    [raw(7, { parent: 50 }), "done", "Done"],
    [raw(8, { parent: 50 }), "planned", "test"],
    [raw(9, { parent: 50 }), "planned", ""],
    [raw(10, { labels: ["wish", "status:in-progress"] }), "in-progress"],
    [raw(11, { labels: ["wish", "status:planned"] }), "planned"],
    [raw(12), "idea"],
    [raw(13, { parent: 50, labels: ["wish", "status:in-progress"] }), "planned", "To Do"],
    [raw(14, { parent: 51 }), "idea"], // parent isn't a project
  ];
  for (const [issue, expected, board] of cases) {
    const proj = board === undefined ? P : { ...P, boardStatus: board };
    const byNumber = new Map([[50, proj], [issue.n, issue]]);
    assert.equal(deriveStatus(issue, { byNumber, projectNumbers: new Set([50]) }), expected, `#${issue.n}`);
  }
});

test("project on no board: wishes fall back to labels", () => {
  const P = project(50, { boardStatus: null });
  const w = raw(1, { parent: 50, labels: ["wish", "status:planned"] });
  assert.equal(deriveStatus(w, { byNumber: new Map([[50, P], [1, w]]), projectNumbers: new Set([50]) }), "planned");
});

test("closed duplicate is excluded and listed in canonical's mergedFrom", () => {
  const { wishes } = derive([raw(1), dupOf(2, 1)], opts);
  assert.deepEqual(wishes.map((w) => w.n), [1]);
  assert.deepEqual(wishes[0].mergedFrom, [2]);
});

test("closed as duplicate in the GitHub UI (no bot marker) is not drawn", () => {
  const { wishes } = derive([raw(1), raw(2, { state: "closed", stateReason: "duplicate" })], opts);
  assert.deepEqual(wishes.map((w) => w.n), [1]);
  assert.deepEqual(wishes[0].mergedFrom, []);
});

test("resolveMerges transitive + cycle-safe", () => {
  const m = resolveMerges([
    { n: 1, mergedInto: 2, open: false },
    { n: 2, mergedInto: 3, open: false },
    { n: 3, mergedInto: null, open: true },
    { n: 4, mergedInto: 5, open: false },
    { n: 5, mergedInto: 4, open: true },
    { n: 6, mergedInto: 7, open: false },
    { n: 7, mergedInto: 6, open: false },
  ]);
  assert.equal(m.get(1), 3);
  assert.equal(m.get(2), 3);
  assert.equal(m.get(3), 3);
  assert.equal(m.get(4), 5);
  assert.equal(m.get(5), 5);
  assert.equal(m.get(6), m.get(7));
});

test("demand unions merged authors + 👍, no dupes", () => {
  const canonical = raw(1, { thumbsUp: [who("nino"), who("u2")] });
  const merged = [dupOf(2, 1, { thumbsUp: [who("nino"), who("lasha")] }), dupOf(3, 2, { author: who("u1") })];
  assert.deepEqual(demand(canonical, merged), ["u1", "nino", "u2", "lasha"]);
  const { wishes, people } = derive([canonical, ...merged], opts);
  assert.deepEqual(wishes[0].people, ["u1", "nino", "u2", "lasha"]);
  assert.deepEqual(wishes[0].mergedFrom, [2, 3]);
  assert.equal(people.lasha.avatar, "https://a/lasha");
});

test("project tasks progress counts only non-wish", () => {
  const P = project(50, { subIssues: [1, 60, 61, 62], boardStatus: "In Progress" });
  const tasks = [
    raw(60, { labels: [], state: "closed", stateReason: "completed" }),
    raw(61, { labels: [] }),
    raw(62, { labels: [], state: "closed", stateReason: "not_planned" }),
  ];
  const { projects, wishes } = derive([raw(1, { parent: 50 }), P, ...tasks], opts);
  assert.deepEqual(projects, [{ n: 50, title: "Project 50", url: "https://x/50", status: "in-progress", tasks: { done: 1, total: 3 } }]);
  assert.equal(wishes.find((w) => w.n === 1).project, 50);
  assert.ok(!wishes.some((w) => w.n >= 60));
});

test("test label excluded unless includeTest", () => {
  const issues = [raw(1, { labels: ["wish", "test"] }), raw(2)];
  assert.deepEqual(derive(issues, opts).wishes.map((w) => w.n), [2]);
  assert.deepEqual(derive(issues, { ...opts, includeTest: true }).wishes.map((w) => w.n), [1, 2]);
});

test("neededBy inverse, and links through merged wishes point to the canonical", () => {
  const { wishes } = derive([raw(1, { blockedBy: [3] }), raw(2, { blockedBy: [1] }), dupOf(3, 4), raw(4), raw(5, { blockedBy: [5, 99] })], opts);
  const by = Object.fromEntries(wishes.map((w) => [w.n, w]));
  assert.deepEqual(by[1].needs, [4]);
  assert.deepEqual(by[4].neededBy, [1]);
  assert.deepEqual(by[1].neededBy, [2]);
  assert.deepEqual(by[5].needs, []); // self and unknown dropped
});

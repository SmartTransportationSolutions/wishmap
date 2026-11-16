import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFilters, sortWishes, TIME_RANK, emptyFilters } from "../site/filters.js";

const W = [
  { n: 1, title: "ყოველკვირეული ანგარიშის გენერირება", problem: "ხელით ვაკეთებ", tools: "Excel", area: "reporting", time: "1-5h", status: "idea", owner: null, people: ["a", "b"], project: null },
  { n: 2, title: "GPS ტრეკები", problem: "ანგარიშებში ვიყენებ", tools: "Python", area: "traffic", time: "5h+", status: "in-progress", owner: "gio", people: ["gio", "a", "c"], project: 101 },
  { n: 3, title: "რუკები", problem: "", tools: "QGIS", area: "gis", time: "rare", status: "planned", owner: null, people: ["c"], project: 102 },
  { n: 4, title: "პრეზენტაციები", problem: "", tools: "", area: "reporting", time: "lt1h", status: "wont-do", owner: null, people: ["d", "e", "f", "g"], project: null },
  { n: 5, title: "ინვოისები", problem: "", tools: "", area: "admin", time: null, status: "done", owner: "nino", people: ["nino", "a"], project: null },
];
const ns = (list) => list.map((w) => w.n);
const f = (over) => ({ ...emptyFilters(), ...over });

test("search Georgian substring (title, problem, tools; NFC + case)", () => {
  assert.deepEqual(ns(applyFilters(W, f({ q: "ანგარიშ" }))), [1, 2]);
  assert.deepEqual(ns(applyFilters(W, f({ q: "excel" }))), [1]);
  assert.deepEqual(ns(applyFilters(W, f({ q: "  QGIS " }))), [3]);
});

test("search by #n", () => {
  assert.deepEqual(ns(applyFilters(W, f({ q: "#3" }))), [3]);
  assert.deepEqual(ns(applyFilters(W, f({ q: "2" }))), [2]);
});

test("wont-do hidden by default", () => {
  assert.ok(!ns(applyFilters(W, f({}))).includes(4));
  assert.ok(ns(applyFilters(W, f({ showWontDo: true }))).includes(4));
});

test("area+status combine (AND across, OR within)", () => {
  assert.deepEqual(ns(applyFilters(W, f({ areas: new Set(["reporting", "traffic"]) }))), [1, 2]);
  assert.deepEqual(ns(applyFilters(W, f({ areas: new Set(["reporting", "traffic"]), statuses: new Set(["idea"]) }))), [1]);
  assert.deepEqual(ns(applyFilters(W, f({ statuses: new Set(["idea", "planned"]) }))), [1, 3]);
});

test("project and person filters", () => {
  assert.deepEqual(ns(applyFilters(W, f({ project: 101 }))), [2]);
  assert.deepEqual(ns(applyFilters(W, f({ person: "a" }))), [1, 2, 5]);
  assert.deepEqual(ns(applyFilters(W, f({ person: "nino" }))), [5]);
});

test("sort demand desc stable", () => {
  const twice = [...W, { ...W[0], n: 6 }];
  assert.deepEqual(ns(sortWishes(twice, "demand", "desc")), [4, 2, 1, 5, 6, 3]);
  assert.deepEqual(ns(sortWishes(W, "demand", "asc")), [3, 1, 5, 2, 4]);
});

test("sort time uses TIME_RANK", () => {
  assert.deepEqual(TIME_RANK, { "5h+": 3, "1-5h": 2, lt1h: 1, rare: 1.5 });
  assert.deepEqual(ns(sortWishes(W, "time", "desc")), [2, 1, 3, 4, 5]);
});

test("sort status follows pipeline order; project nulls last", () => {
  assert.deepEqual(ns(sortWishes(W, "status", "asc")), [1, 3, 2, 5, 4]);
  assert.deepEqual(ns(sortWishes(W, "project", "asc")), [2, 3, 1, 4, 5]);
});

test("sortWishes does not mutate its input", () => {
  const copy = [...W];
  sortWishes(W, "demand", "desc");
  assert.deepEqual(W, copy);
});

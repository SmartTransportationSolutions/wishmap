import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, similarity, sharedStems, findRelated, DEFAULT_THRESHOLD } from "../lib/match-trigram.js";

const A = "ყოველკვირეული ანგარიშის ავტომატური გენერირება";
const B = "ანგარიშების ავტომატურად შექმნა ყოველ კვირას";
const C = "პარკირების მონაცემების GIS რუკაზე დატანა";

test("normalize lowercases, strips non-letters, collapses spaces", () => {
  assert.equal(normalize("  GIS — რუკა!!  2024\n"), "gis რუკა");
});

test("georgian inflections", () => {
  assert.ok(similarity("ანგარიში", "ანგარიშის") > 0.5);
  assert.ok(similarity("ანგარიშები", "ანგარიში") > 0.5);
});

test("related pair ≥ threshold", () => {
  assert.equal(DEFAULT_THRESHOLD, 0.3);
  assert.ok(similarity(A, B) >= DEFAULT_THRESHOLD, `score ${similarity(A, B)}`);
});

test("unrelated < 0.15", () => {
  assert.ok(similarity(A, C) < 0.15, `score ${similarity(A, C)}`);
});

test("similarity of empty text is 0", () => {
  assert.equal(similarity("", B), 0);
});

test("findRelated excludes self & exclude-set, caps at 3", () => {
  const cands = [
    { n: 1, text: A },
    { n: 2, text: B },
    { n: 3, text: B + " ფაილი" },
    { n: 4, text: "ანგარიშის ავტომატური შექმნა" },
    { n: 5, text: "ყოველკვირეული ანგარიშის გენერირება" },
    { n: 6, text: C },
  ];
  const out = findRelated({ n: 1, text: A }, cands, { exclude: new Set([3]) });
  assert.ok(out.length <= 3);
  assert.ok(!out.some((r) => r.n === 1 || r.n === 3 || r.n === 6));
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].score >= out[i].score);
  assert.ok(out.every((r) => Array.isArray(r.shared)));
});

test("sharedStems returns ანგარ", () => {
  const s = sharedStems(A, B);
  assert.ok(s.includes("ანგარ"), JSON.stringify(s));
  assert.ok(s.length <= 3);
});

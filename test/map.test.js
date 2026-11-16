import { test } from "node:test";
import assert from "node:assert/strict";
import { bubbleRadius, truncateLabel, projectHull, wrapLabel } from "../site/map.js";

test("bubbleRadius clamps 14..56 and grows with people", () => {
  assert.equal(bubbleRadius(0), 14);
  assert.equal(bubbleRadius(1), 19);
  assert.ok(bubbleRadius(4) > bubbleRadius(2));
  assert.equal(bubbleRadius(4), 28);
  assert.equal(bubbleRadius(100), 56);
});

test("truncateLabel graphemes", () => {
  assert.equal(truncateLabel("მოკლე"), "მოკლე");
  const long = "მოძრაობის აღრიცხვის ვიდეოების ავტომატური დამუშავება";
  const t = truncateLabel(long, 20);
  assert.equal([...new Intl.Segmenter("ka", { granularity: "grapheme" }).segment(t)].length, 20);
  assert.ok(t.endsWith("…"));
  const emoji = "👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦 ოჯახი";
  assert.equal(truncateLabel(emoji, 3), "👨‍👩‍👧‍👦👨‍👩‍👧‍👦…");
});

test("wrapLabel splits into at most 2 lines by words", () => {
  assert.deepEqual(wrapLabel("ინვოისების შედგენა დროის აღრიცხვიდან", 18), ["ინვოისების შედგენა", "დროის აღრიცხვიდან"]);
  assert.deepEqual(wrapLabel("მოკლე", 18), ["მოკლე"]);
  const lines = wrapLabel("ერთი ორი სამი ოთხი ხუთი ექვსი შვიდი რვა ცხრა ათი", 10);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"));
});

test("projectHull contains all members", () => {
  const members = [{ x: 0, y: 0, r: 20 }, { x: 100, y: 0, r: 30 }, { x: 50, y: 80, r: 14 }];
  const h = projectHull(members);
  for (const m of members) {
    assert.ok(Math.hypot(m.x - h.cx, m.y - h.cy) + m.r <= h.r, JSON.stringify(m));
  }
  assert.equal(h.cx, 50);
  assert.equal(projectHull([{ x: 10, y: 10, r: 20 }]).r, 38);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIELDS, AREAS, TIMES, STARTED, MAP_URL, renderFormYaml } from "../shared/form-schema.js";
import { parseWishBody } from "../lib/parse-form.js";

const label = (id) => FIELDS.find((f) => f.id === id).label;
const bodyOf = (pairs) => pairs.map(([id, v]) => `### ${label(id)}\n\n${v}`).join("\n\n");

test("generated yaml matches template file", () => {
  const onDisk = readFileSync(new URL("../templates/wish.yml", import.meta.url), "utf8");
  assert.equal(renderFormYaml({ mapUrl: MAP_URL }), onDisk);
});

test("yaml has 6 fields, required = problem,done,area,time", () => {
  assert.deepEqual(FIELDS.map((f) => f.id), ["problem", "done", "area", "time", "tools", "started"]);
  assert.deepEqual(FIELDS.filter((f) => f.required).map((f) => f.id), ["problem", "done", "area", "time"]);
  const yaml = renderFormYaml({ mapUrl: MAP_URL });
  for (const f of FIELDS) assert.ok(yaml.includes(`id: ${f.id}\n`), `missing id ${f.id}`);
  assert.equal(yaml.match(/required: true/g).length, 4);
  assert.ok(yaml.includes('labels: ["wish"]'));
  assert.ok(yaml.includes(MAP_URL));
});

test("parseWishBody round-trip", () => {
  const body = bodyOf([
    ["problem", "ყოველ ორშაბათს ხელით ვაერთიანებ ფაილებს"],
    ["done", "ანგარიში თავისით მზადდება"],
    ["area", AREAS.find((a) => a.slug === "reporting").label],
    ["time", TIMES.find((t) => t.slug === "1-5h").label],
    ["tools", "_No response_"],
    ["started", STARTED.yes],
  ]);
  assert.deepEqual(parseWishBody(body), {
    problem: "ყოველ ორშაბათს ხელით ვაერთიანებ ფაილებს",
    done: "ანგარიში თავისით მზადდება",
    tools: "",
    area: "reporting",
    time: "1-5h",
    startedByAuthor: true,
    complete: true,
  });
});

test("parseWishBody fallback", () => {
  const out = parseWishBody("უბრალოდ ტექსტი, ფორმის გარეშე");
  assert.equal(out.problem, "უბრალოდ ტექსტი, ფორმის გარეშე");
  assert.equal(out.complete, false);
  assert.equal(out.area, null);
  assert.equal(out.time, null);
  assert.equal(out.startedByAuthor, false);
  assert.deepEqual(parseWishBody(null).complete, false);
});

test("unknown dropdown value → null", () => {
  const out = parseWishBody(bodyOf([["problem", "x"], ["done", "y"], ["area", "რაღაც სხვა"], ["time", "_No response_"]]));
  assert.equal(out.area, null);
  assert.equal(out.time, null);
  assert.equal(out.startedByAuthor, false);
});

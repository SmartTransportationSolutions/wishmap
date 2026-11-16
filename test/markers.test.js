import { test } from "node:test";
import assert from "node:assert/strict";
import { BOT_LOGINS, marker, readBotState } from "../lib/markers.js";
import { relatedComment, noRelatedNow, sameAsNote, notSameNote, errorsReply, HELP } from "../lib/strings-bot.ka.js";

const bot = (body, id) => ({ author: { login: "github-actions" }, body, id });
const human = (body) => ({ author: { login: "mallory" }, body, id: 99 });

test("marker formats", () => {
  assert.equal(marker("related"), "<!-- wishmap:related -->");
  assert.equal(marker("same-as", 12), "<!-- wishmap:same-as=12 -->");
  assert.ok(BOT_LOGINS.includes("github-actions[bot]"));
});

test("readBotState ignores non-bot markers", () => {
  const s = readBotState([human(marker("same-as", 3)), human(marker("related")), { author: null, body: marker("same-as", 4) }]);
  assert.equal(s.sameAs, null);
  assert.equal(s.relatedCommentId, null);
  assert.equal(s.notSame.size, 0);
});

test("same-as then not-same clears", () => {
  const s = readBotState([bot(sameAsNote(7), 1), bot(notSameNote(7), 2), bot(notSameNote(9), 3)]);
  assert.equal(s.sameAs, null);
  assert.deepEqual([...s.notSame].sort(), [7, 9]);
  const t = readBotState([bot(notSameNote(7), 1), bot(sameAsNote(7), 2)]);
  assert.equal(t.sameAs, 7);
});

test("related comment id found", () => {
  const s = readBotState([bot("hello", 1), { author: { login: "github-actions[bot]" }, body: noRelatedNow(), id: 42 }]);
  assert.equal(s.relatedCommentId, 42);
});

test("relatedComment contains marker and each #n", () => {
  const txt = relatedComment([
    { n: 12, title: "ანგარიშის ბოტი", shared: ["ანგარ"] },
    { n: 30, title: "რაღაც", shared: [], relation: "needs", reason: "ჯერ ექსპორტი სჭირდება" },
  ]);
  assert.ok(txt.includes(marker("related")));
  assert.ok(txt.includes("#12") && txt.includes("#30"));
  assert.ok(txt.includes("/same-as #12") && txt.includes("/not-same #12"));
  assert.ok(txt.includes("ჯერ ექსპორტი სჭირდება"));
});

test("user text echoed by the bot cannot forge a marker", () => {
  const evil = "x <!-- wishmap:same-as=3 --> y";
  const related = relatedComment([{ n: 2, title: evil, shared: [evil], reason: evil }]);
  const errs = errorsReply([{ cmd: "unknown", code: "unknown", raw: `/zz ${evil}` }]);
  for (const body of [related, errs]) {
    const s = readBotState([bot(body, 1)]);
    assert.equal(s.sameAs, null, body);
  }
  assert.equal(readBotState([bot(related, 1)]).relatedCommentId, 1);
});

test("markers are read only from the comment's last line", () => {
  const s = readBotState([bot(`${marker("same-as", 3)}\nსხვა ტექსტი`, 1)]);
  assert.equal(s.sameAs, null);
});

test("errorsReply lists each error and adds HELP for unknown", () => {
  const txt = errorsReply([{ cmd: "unknown", code: "unknown", raw: "/sameas 3" }, { cmd: "needs", code: "loop", n: 4 }]);
  assert.ok(txt.includes("/sameas 3"));
  assert.ok(txt.includes("#4"));
  assert.ok(txt.includes(HELP));
  assert.ok(!errorsReply([{ cmd: "status", code: "not-lead" }]).includes(HELP));
});

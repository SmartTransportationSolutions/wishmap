import { test } from "node:test";
import assert from "node:assert/strict";
import { createGh, GhError } from "../lib/gh.js";

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body ?? ""),
    };
  };
  return { impl, calls };
}

test("rest sends auth + JSON", async () => {
  const f = fakeFetch([{ status: 200, body: { ok: 1 } }]);
  const gh = createGh({ token: "t", fetchImpl: f.impl });
  const out = await gh.rest("POST", "/repos/o/r/issues/1/labels", { labels: ["wish"] });
  assert.deepEqual(out, { ok: 1 });
  const { url, init } = f.calls[0];
  assert.equal(url, "https://api.github.com/repos/o/r/issues/1/labels");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.authorization, "Bearer t");
  assert.equal(init.headers.accept, "application/vnd.github+json");
  assert.equal(init.headers["x-github-api-version"], "2022-11-28");
  assert.deepEqual(JSON.parse(init.body), { labels: ["wish"] });
});

test("rest 204 → null", async () => {
  const f = fakeFetch([{ status: 204, body: null }]);
  const gh = createGh({ token: "t", fetchImpl: f.impl });
  assert.equal(await gh.rest("DELETE", "/x"), null);
});

test("rest 404 → GhError{status:404, path}", async () => {
  const f = fakeFetch([{ status: 404, body: { message: "Not Found" } }]);
  const gh = createGh({ token: "t", fetchImpl: f.impl });
  await assert.rejects(gh.rest("GET", "/repos/o/r/issues/9", { secret: "BODYTEXT" }), (e) => {
    assert.ok(e instanceof GhError);
    assert.equal(e.status, 404);
    assert.equal(e.path, "/repos/o/r/issues/9");
    assert.ok(!e.message.includes("BODYTEXT"));
    return true;
  });
});

test("graphql returns data", async () => {
  const f = fakeFetch([{ status: 200, body: { data: { viewer: { login: "x" } } } }]);
  const gh = createGh({ token: "t", fetchImpl: f.impl });
  const data = await gh.graphql("query { viewer { login } }", { a: 1 });
  assert.deepEqual(data, { viewer: { login: "x" } });
  assert.equal(f.calls[0].url, "https://api.github.com/graphql");
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { query: "query { viewer { login } }", variables: { a: 1 } });
});

test("graphql errors[] → GhError{status:200} without variables", async () => {
  const f = fakeFetch([{ status: 200, body: { errors: [{ type: "NOT_FOUND", message: "Could not resolve" }] } }]);
  const gh = createGh({ token: "t", fetchImpl: f.impl });
  await assert.rejects(gh.graphql("query { x }", { title: "SECRET-TITLE" }), (e) => {
    assert.ok(e instanceof GhError);
    assert.equal(e.status, 200);
    assert.ok(e.message.includes("NOT_FOUND"));
    assert.ok(!e.message.includes("SECRET-TITLE"));
    return true;
  });
});

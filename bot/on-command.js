// Runs on new comments in the wishlist: executes /same-as, /needs, /claim, /status … commands.
// Success → 👍 reaction; any failure → 😕 plus ONE Georgian reply. Logs never include wish text.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createGh } from "../lib/gh.js";
import { parseCommands, isLead, wouldCreateLoop, STATUS_VALUES } from "../lib/commands.js";
import { readBotState, isBot } from "../lib/markers.js";
import { sameAsNote, notSameNote, errorsReply } from "../lib/strings-bot.ka.js";
import { listAll } from "./on-wish.js";
import { dispatchRebuild } from "./dispatch.js";

const CLOSE_DUPLICATE = `mutation($issueId: ID!, $dupId: ID!) {
  closeIssue(input: {issueId: $issueId, stateReason: DUPLICATE, duplicateIssueId: $dupId}) { issue { number } }
}`;

const names = (labels) => (labels || []).map((l) => (typeof l === "string" ? l : l.name));
const enc = encodeURIComponent;

class CmdError extends Error {
  constructor(code, n) {
    super(code);
    this.code = code;
    this.n = n;
  }
}

export async function handleComment({ gh, owner, repo, issue, comment, dispatch = async () => {} }) {
  if (comment.user?.type === "Bot" || isBot(comment.user)) return { results: [] };
  if (!names(issue.labels).includes("wish")) return { results: [], skipped: true };
  const commands = parseCommands(comment.body);
  if (!commands.length) return { results: [] };

  const R = `/repos/${owner}/${repo}`;
  const X = issue.number;
  const login = comment.user.login;
  const cache = new Map();

  const ignore404 = async (p) => {
    try { return await p; } catch (e) { if (e.status !== 404) throw e; return null; }
  };
  const getIssue = async (n) => {
    if (!cache.has(n)) cache.set(n, await ignore404(gh.rest("GET", `${R}/issues/${n}`)));
    return cache.get(n);
  };
  const commentsOf = async (n) =>
    (await listAll(gh, `${R}/issues/${n}/comments`)).map((c) => ({ author: c.user ? { login: c.user.login } : null, body: c.body, id: c.id }));
  const getNeeds = async (n) => (await listAll(gh, `${R}/issues/${n}/dependencies/blocked_by`)).map((i) => i.number);
  let role;
  const getRole = async () => {
    if (role === undefined) {
      try { role = (await gh.rest("GET", `${R}/collaborators/${enc(login)}/permission`)).role_name; } catch { role = "read"; }
    }
    return role;
  };
  const target = async (n) => {
    if (n === X) throw new CmdError("self", n);
    const t = await getIssue(n);
    if (!t || t.pull_request) throw new CmdError("not-found", n);
    if (!names(t.labels).includes("wish")) throw new CmdError("not-a-wish", n);
    return t;
  };
  const reopenIfClosed = async () => {
    if (issue.state === "closed" && issue.state_reason !== "duplicate") await gh.rest("PATCH", `${R}/issues/${X}`, { state: "open" });
  };
  const removeLabel = (l) => ignore404(gh.rest("DELETE", `${R}/issues/${X}/labels/${enc(l)}`));

  const run = {
    "same-as": async (n) => {
      const t = await target(n);
      if (readBotState(await commentsOf(n)).sameAs === X) throw new CmdError("loop", n);
      if (t.state === "closed") throw new CmdError("closed", n);
      await gh.graphql(CLOSE_DUPLICATE, { issueId: issue.node_id, dupId: t.node_id });
      await gh.rest("POST", `${R}/issues/${X}/comments`, { body: sameAsNote(n) });
    },
    "not-same": async (n) => {
      if (n === X) throw new CmdError("self", n);
      const state = readBotState(await commentsOf(X));
      if (state.sameAs === n && issue.state === "closed") await gh.rest("PATCH", `${R}/issues/${X}`, { state: "open" });
      await gh.rest("POST", `${R}/issues/${X}/comments`, { body: notSameNote(n) });
    },
    needs: async (n) => {
      const t = await target(n);
      if (await wouldCreateLoop(X, n, getNeeds)) throw new CmdError("loop", n);
      if ((await getNeeds(X)).includes(n)) return;
      await gh.rest("POST", `${R}/issues/${X}/dependencies/blocked_by`, { issue_id: t.id });
    },
    unneed: async (n) => {
      const t = await target(n);
      await ignore404(gh.rest("DELETE", `${R}/issues/${X}/dependencies/blocked_by/${t.id}`));
    },
    claim: async () => {
      await gh.rest("POST", `${R}/issues/${X}/assignees`, { assignees: [login] });
      await gh.rest("POST", `${R}/issues/${X}/labels`, { labels: ["status:in-progress"] });
    },
    unclaim: async () => {
      const after = await gh.rest("DELETE", `${R}/issues/${X}/assignees`, { assignees: [login] });
      if (!after || !after.assignees || after.assignees.length === 0) await removeLabel("status:in-progress");
    },
    status: async (value) => {
      if (!isLead(await getRole())) throw new CmdError("not-lead");
      if (!STATUS_VALUES.includes(value)) throw new CmdError("bad-status");
      if (value === "done") return gh.rest("PATCH", `${R}/issues/${X}`, { state: "closed", state_reason: "completed" });
      if (value === "wont-do") return gh.rest("PATCH", `${R}/issues/${X}`, { state: "closed", state_reason: "not_planned" });
      for (const l of ["status:planned", "status:in-progress"]) if (l !== `status:${value}`) await removeLabel(l);
      if (value !== "idea") await gh.rest("POST", `${R}/issues/${X}/labels`, { labels: [`status:${value}`] });
      await reopenIfClosed();
    },
  };

  const results = [];
  for (const c of commands) {
    if (c.cmd === "unknown") {
      results.push({ cmd: "unknown", ok: false, code: "unknown", raw: c.raw });
      continue;
    }
    try {
      await run[c.cmd](c.arg);
      results.push(typeof c.arg === "number" ? { cmd: c.cmd, ok: true, n: c.arg } : { cmd: c.cmd, ok: true });
    } catch (e) {
      const code = e instanceof CmdError ? e.code : "failed";
      results.push({ cmd: c.cmd, ok: false, code, ...(typeof c.arg === "number" ? { n: c.arg } : {}) });
    }
  }

  const failed = results.filter((r) => !r.ok);
  await ignore404(gh.rest("POST", `${R}/issues/comments/${comment.id}/reactions`, { content: failed.length ? "confused" : "+1" }));
  if (failed.length) await gh.rest("POST", `${R}/issues/${X}/comments`, { body: errorsReply(failed) });
  if (results.some((r) => r.ok)) await dispatch();
  return { results };
}

export async function main(env = process.env) {
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const [owner, repo] = env.GITHUB_REPOSITORY.split("/");
  const gh = createGh({ token: env.GITHUB_TOKEN });
  const dispatch = env.WISHMAP_DISPATCH_TOKEN
    ? () => dispatchRebuild({ gh: createGh({ token: env.WISHMAP_DISPATCH_TOKEN }), owner })
    : async () => {};
  const { results } = await handleComment({ gh, owner, repo, issue: event.issue, comment: event.comment, dispatch });
  console.log(`commands=${results.length} ok=${results.filter((r) => r.ok).length} failed=${results.filter((r) => !r.ok).map((r) => r.code).join(",") || "-"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`on-command failed: ${e.name} ${e.status ?? ""} ${e.path ?? ""}`);
    process.exit(1);
  });
}

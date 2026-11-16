// Runs when a wish is opened or edited: sets area/time labels, handles "I've started",
// and posts (or updates) one "possibly related" comment. Logs never include wish text.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createGh } from "../lib/gh.js";
import { parseWishBody } from "../lib/parse-form.js";
import { findRelated } from "../lib/match-trigram.js";
import { readBotState } from "../lib/markers.js";
import { relatedComment, noRelatedNow } from "../lib/strings-bot.ka.js";
import { displayTitle } from "../site/shared/form-schema.js";
import { dispatchRebuild } from "./dispatch.js";

export const trigramMatcher = async (wish, candidates, exclude) => findRelated(wish, candidates, { exclude });

export function withFallback(primary, fallback, log = console.log) {
  return async (...args) => {
    try {
      return await primary(...args);
    } catch {
      log("claude matcher failed; using trigram");
      return fallback(...args);
    }
  };
}

const names = (labels) => (labels || []).map((l) => (typeof l === "string" ? l : l.name));
const enc = encodeURIComponent;

export async function listAll(gh, path) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const batch = await gh.rest("GET", `${path}${sep}per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

export async function handleWish({ gh, owner, repo, action, issue, matcher }) {
  const current = names(issue.labels);
  if (!current.includes("wish")) return { labelsSet: [], commented: null, skipped: true };
  const base = `/repos/${owner}/${repo}/issues/${issue.number}`;
  const parsed = parseWishBody(issue.body);

  // Labels
  const wanted = [parsed.area && `area:${parsed.area}`, parsed.time && `time:${parsed.time}`].filter(Boolean);
  if (action === "opened" && parsed.startedByAuthor && issue.user?.login) {
    await gh.rest("POST", `${base}/assignees`, { assignees: [issue.user.login] });
    wanted.push("status:in-progress");
  }
  if (action === "edited") {
    for (const old of current.filter((l) => /^(area|time):/.test(l) && !wanted.includes(l))) {
      await gh.rest("DELETE", `${base}/labels/${enc(old)}`);
    }
  }
  const toAdd = wanted.filter((l) => !current.includes(l));
  if (toAdd.length) await gh.rest("POST", `${base}/labels`, { labels: toAdd });

  // Related wishes
  const comments = (await listAll(gh, `${base}/comments`)).map((c) => ({
    author: c.user ? { login: c.user.login } : null,
    body: c.body,
    id: c.id,
  }));
  const state = readBotState(comments);
  const open = (await listAll(gh, `/repos/${owner}/${repo}/issues?labels=wish&state=open`)).filter((i) => !i.pull_request);
  const candidates = open
    .filter((i) => i.number !== issue.number)
    .map((i) => ({ n: i.number, title: displayTitle(i.title), text: `${displayTitle(i.title)} ${parseWishBody(i.body).problem}` }));
  const wish = { n: issue.number, title: displayTitle(issue.title), text: `${displayTitle(issue.title)} ${parsed.problem}` };
  const results = await matcher(wish, candidates, state.notSame);
  const byN = new Map(candidates.map((c) => [c.n, c]));
  const items = results.filter((r) => byN.has(r.n)).map((r) => ({ ...r, title: byN.get(r.n).title }));

  let commented = null;
  if (items.length) {
    const body = relatedComment(items);
    if (state.relatedCommentId) {
      await gh.rest("PATCH", `/repos/${owner}/${repo}/issues/comments/${state.relatedCommentId}`, { body });
      commented = "updated";
    } else {
      await gh.rest("POST", `${base}/comments`, { body });
      commented = "created";
    }
  } else if (state.relatedCommentId) {
    await gh.rest("PATCH", `/repos/${owner}/${repo}/issues/comments/${state.relatedCommentId}`, { body: noRelatedNow() });
    commented = "updated";
  }
  return { labelsSet: toAdd, commented };
}

export async function main(env = process.env) {
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const [owner, repo] = env.GITHUB_REPOSITORY.split("/");
  const gh = createGh({ token: env.GITHUB_TOKEN });
  let matcher = trigramMatcher;
  if (env.ANTHROPIC_API_KEY) {
    try {
      const m = await import("../lib/match-claude.js");
      matcher = withFallback(await m.makeClaudeMatcher(env.ANTHROPIC_API_KEY), trigramMatcher);
    } catch {
      console.log("claude matcher unavailable; using trigram");
    }
  }
  const res = await handleWish({ gh, owner, repo, action: event.action, issue: event.issue, matcher });
  console.log(`labels_added=${res.labelsSet.length} comment=${res.commented ?? "none"}${res.skipped ? " skipped" : ""}`);
  if (env.WISHMAP_DISPATCH_TOKEN && !res.skipped) {
    await dispatchRebuild({ gh: createGh({ token: env.WISHMAP_DISPATCH_TOKEN }), owner });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`on-wish failed: ${e.name} ${e.status ?? ""} ${e.path ?? ""}`);
    process.exit(1);
  });
}

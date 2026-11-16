// RawIssue[] → MapData v1 (the contract the site renders). Pure functions, no I/O.
import { parseWishBody } from "../lib/parse-form.js";
import { readBotState } from "../lib/markers.js";
import { displayTitle } from "../shared/form-schema.js";

const BOARD_TO_STATUS = { "To Do": "planned", "In Progress": "in-progress", "In Review": "in-progress", Done: "done" };
const has = (issue, label) => issue.labels.includes(label);
const isClosedDuplicate = (i) => i.state === "closed" && i.stateReason === "duplicate";

export function deriveStatus(issue, { byNumber, projectNumbers }) {
  if (issue.state === "closed") {
    if (issue.stateReason === "not_planned") return "wont-do";
    if (issue.stateReason === "duplicate") return "merged";
    return "done";
  }
  const parent = issue.parent != null && projectNumbers.has(issue.parent) ? byNumber.get(issue.parent) : null;
  if (parent && parent.boardStatus !== null && parent.boardStatus !== undefined) {
    return BOARD_TO_STATUS[parent.boardStatus] || "planned";
  }
  if (has(issue, "status:in-progress")) return "in-progress";
  if (has(issue, "status:planned")) return "planned";
  return "idea";
}

function projectStatus(p) {
  if (p.state === "closed") return "done";
  if (p.boardStatus === null || p.boardStatus === undefined) return "planned";
  return BOARD_TO_STATUS[p.boardStatus] || "planned";
}

// wishes: [{ n, mergedInto: n|null, open: boolean }] → Map<n, canonical n>
export function resolveMerges(wishes) {
  const by = new Map(wishes.map((w) => [w.n, w]));
  const out = new Map();
  for (const w of wishes) {
    const path = [];
    const seen = new Set();
    let cur = w;
    while (cur && cur.mergedInto != null && by.has(cur.mergedInto) && !seen.has(cur.n)) {
      seen.add(cur.n);
      path.push(cur.n);
      cur = by.get(cur.mergedInto);
    }
    let canonical;
    if (cur && seen.has(cur.n)) {
      // Cycle: pick the open member (lowest number among open, else lowest overall).
      const loop = path.slice(path.indexOf(cur.n)).map((n) => by.get(n));
      const open = loop.filter((x) => x.open);
      canonical = Math.min(...(open.length ? open : loop).map((x) => x.n));
    } else {
      canonical = cur ? cur.n : w.n;
    }
    out.set(w.n, canonical);
  }
  return out;
}

export function demand(canonical, merged) {
  const out = [];
  const add = (p) => p && p.login && !out.includes(p.login) && out.push(p.login);
  for (const issue of [canonical, ...merged]) {
    add(issue.author);
    for (const p of issue.thumbsUp || []) add(p);
  }
  return out;
}

export function derive(raw, { now = new Date(), includeTest = false, newWishUrl, repoUrl } = {}) {
  const issues = raw.filter((i) => includeTest || !has(i, "test"));
  const byNumber = new Map(issues.map((i) => [i.n, i]));
  const projectsRaw = issues.filter((i) => has(i, "project") && !(i.state === "closed" && i.stateReason === "not_planned"));
  const projectNumbers = new Set(projectsRaw.map((p) => p.n));
  const wishRaw = issues.filter((i) => has(i, "wish") && !has(i, "project"));

  // Merges: only closed-as-duplicate wishes with a bot marker pointing at another wish count.
  const wishNumbers = new Set(wishRaw.map((w) => w.n));
  const mergeInput = wishRaw.map((w) => {
    const target = isClosedDuplicate(w) ? readBotState(w.botComments).sameAs : null;
    return { n: w.n, mergedInto: target != null && wishNumbers.has(target) && target !== w.n ? target : null, open: w.state === "open" };
  });
  const canonicalOf = resolveMerges(mergeInput);
  // A wish closed as duplicate with no known target (closed in the GitHub UI) is hidden too.
  const visible = wishRaw.filter((w) => canonicalOf.get(w.n) === w.n && !isClosedDuplicate(w));
  const visibleSet = new Set(visible.map((w) => w.n));
  const mergedInto = (n) => wishRaw.filter((w) => w.n !== n && canonicalOf.get(w.n) === n).sort((a, b) => a.n - b.n);
  const mapLink = (n) => (canonicalOf.has(n) ? canonicalOf.get(n) : n);

  const people = {};
  const remember = (p) => p && p.login && !people[p.login] && (people[p.login] = { avatar: p.avatar || "" });
  for (const i of issues) {
    remember(i.author);
    (i.assignees || []).forEach(remember);
    (i.thumbsUp || []).forEach(remember);
  }

  const ctx = { byNumber, projectNumbers };
  const wishes = visible
    .map((w) => {
      const merged = mergedInto(w.n);
      const form = parseWishBody(w.body);
      const needs = [...new Set([w, ...merged].flatMap((x) => x.blockedBy).map(mapLink))]
        .filter((n) => n !== w.n && visibleSet.has(n))
        .sort((a, b) => a - b);
      return {
        n: w.n,
        title: displayTitle(w.title),
        url: w.url,
        problem: form.problem,
        done: form.done,
        tools: form.tools,
        area: form.area,
        time: form.time,
        status: deriveStatus(w, ctx),
        owner: w.assignees[0]?.login ?? null,
        people: demand(w, merged),
        mergedFrom: merged.map((m) => m.n),
        needs,
        neededBy: [],
        project: w.parent != null && projectNumbers.has(w.parent) ? w.parent : null,
        createdAt: w.createdAt,
      };
    })
    .sort((a, b) => a.n - b.n);

  const byWish = new Map(wishes.map((w) => [w.n, w]));
  for (const w of wishes) for (const n of w.needs) byWish.get(n).neededBy.push(w.n);
  for (const w of wishes) w.neededBy.sort((a, b) => a - b);

  const projects = projectsRaw
    .map((p) => {
      const tasks = (p.subIssues || [])
        .map((n) => byNumber.get(n))
        .filter((t) => t && !has(t, "wish") && !has(t, "project"));
      return {
        n: p.n,
        title: displayTitle(p.title),
        url: p.url,
        status: projectStatus(p),
        tasks: { done: tasks.filter((t) => t.state === "closed" && t.stateReason !== "not_planned").length, total: tasks.length },
      };
    })
    .sort((a, b) => a.n - b.n);

  return { v: 1, generatedAt: now.toISOString(), newWishUrl, repoUrl, wishes, projects, people };
}

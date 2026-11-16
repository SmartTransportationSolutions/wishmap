// Read every issue in the wishlist repo (open + closed) with the fields the map needs.
// Field names confirmed in docs/github-api-notes.md.
import { BOT_LOGINS } from "../lib/markers.js";

export const ISSUES_QUERY = `query($owner: String!, $repo: String!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    issues(first: 50, after: $cursor, orderBy: {field: CREATED_AT, direction: ASC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number id title body state stateReason url createdAt
        author { login avatarUrl }
        assignees(first: 10) { nodes { login avatarUrl } }
        labels(first: 30) { nodes { name } }
        reactions(content: THUMBS_UP, first: 100) { nodes { user { login avatarUrl } } }
        parent { number }
        subIssues(first: 100) { nodes { number } }
        blockedBy(first: 50) { nodes { number } }
        comments(last: 50) { nodes { databaseId author { login } body } }
        projectItems(first: 10) {
          nodes {
            project { number owner { ... on Organization { login } } }
            fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          }
        }
      }
    }
  }
}`;

const person = (u) => (u && u.login ? { login: u.login, avatar: u.avatarUrl || "" } : null);
const nodes = (c) => (c && Array.isArray(c.nodes) ? c.nodes : []);

function boardStatusOf(node, owner, boardNumber) {
  const item = nodes(node.projectItems).find((it) => it.project?.number === boardNumber && it.project?.owner?.login === owner);
  if (!item) return null;
  return item.fieldValueByName?.name ?? "";
}

function toRaw(node, owner, boardNumber) {
  return {
    n: node.number,
    id: node.id,
    title: node.title || "",
    body: node.body || "",
    state: String(node.state || "").toLowerCase(),
    stateReason: node.stateReason ? String(node.stateReason).toLowerCase() : null,
    url: node.url,
    createdAt: node.createdAt,
    author: person(node.author),
    assignees: nodes(node.assignees).map(person).filter(Boolean),
    labels: nodes(node.labels).map((l) => l.name),
    thumbsUp: nodes(node.reactions).map((r) => person(r.user)).filter(Boolean),
    parent: node.parent ? node.parent.number : null,
    subIssues: nodes(node.subIssues).map((s) => s.number),
    blockedBy: nodes(node.blockedBy).map((b) => b.number),
    botComments: nodes(node.comments)
      .filter((c) => c.author && BOT_LOGINS.includes(c.author.login))
      .map((c) => ({ author: { login: c.author.login }, body: c.body || "", id: c.databaseId })),
    boardStatus: boardStatusOf(node, owner, boardNumber),
  };
}

export async function collect({ gh, owner, repo, boardNumber = 1 }) {
  const out = [];
  let cursor = null;
  for (let guard = 0; guard < 200; guard++) {
    const data = await gh.graphql(ISSUES_QUERY, { owner, repo, cursor });
    const conn = data.repository.issues;
    for (const node of conn.nodes) out.push(toRaw(node, owner, boardNumber));
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return out;
}

# GitHub API notes (probed 2026-11-16 on a Free-plan org)

Confirmed against live throwaway issues; the bot and builder rely on exactly these shapes.

## REST
| Purpose | Call | Notes |
|---|---|---|
| Add "needs" (X blocked by N) | `POST /repos/{o}/{r}/issues/{X}/dependencies/blocked_by` body `{"issue_id": <N database id>}` | Returns the X issue. Unknown id → `404 {"message":"Not Found","status":"404"}` |
| List X's blockers | `GET /repos/{o}/{r}/issues/{X}/dependencies/blocked_by` | Array of issues (`number`, `id`, …) |
| Remove "needs" | `DELETE /repos/{o}/{r}/issues/{X}/dependencies/blocked_by/{N database id}` | Returns the X issue |
| Add sub-issue | `POST /repos/{o}/{r}/issues/{P}/sub_issues` body `{"sub_issue_id": <child database id>}` | Response has `sub_issues_summary {total, completed, percent_completed}` |
| Commenter's role | `GET /repos/{o}/{r}/collaborators/{login}/permission` | `{permission, role_name}`; non-collaborator → `permission: "none"` (HTTP 200) |
| Issue state | `GET /repos/{o}/{r}/issues/{n}` | `state` `open`/`closed`; `state_reason` `completed`/`not_planned`/`duplicate`/`reopened`/null |

Database id = REST `id` (e.g. `6425860607`); node id = REST `node_id` = GraphQL `id`.

## GraphQL
- `Issue` fields that exist with these exact names: `parent { number }`, `subIssues(first:) { nodes { number } }`,
  `blockedBy(first:) { nodes { number } }`, `reactions(content: THUMBS_UP, first:) { nodes { user { login avatarUrl } } }`,
  `comments(last:) { nodes { databaseId author { login } body } }`,
  `projectItems(first:) { nodes { project { number owner { ... on Organization { login } } } fieldValueByName(name:"Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } }`.
- `stateReason` values are upper-case: `COMPLETED`, `NOT_PLANNED`, `DUPLICATE`, `REOPENED`, or null.
- `closeIssue(input:{issueId, stateReason: DUPLICATE, duplicateIssueId})` works; the REST view then shows
  `state_reason: "duplicate"` and the duplicate's timeline gets a `closed` event.
- The `projectItems … Status` shape is accepted by the schema. It was **not** exercised against board #1, because
  the board is never written by this project. It is exercised in the live end-to-end test after a lead adds a
  project issue to the board by hand.
- `deleteIssue(input:{issueId})` removes throwaway issues (admin only).

## Pagination
`repository.issues(first: 50, after: $cursor, orderBy:{field: CREATED_AT, direction: ASC})` with `states` omitted
returns open and closed issues; `pageInfo { hasNextPage endCursor }`.

// Hidden markers in the bot's own comments record links and suggestions.
// They are trusted ONLY from bot authors, so nobody can forge a link by pasting one.

export const BOT_LOGINS = ["github-actions", "github-actions[bot]"];

export function marker(kind, value) {
  return value === undefined ? `<!-- wishmap:${kind} -->` : `<!-- wishmap:${kind}=${value} -->`;
}

const MARKER_RE = /<!-- wishmap:([a-z-]+)(?:=([^\s>]+))? -->/g;

export function readMarkers(body) {
  return [...String(body ?? "").matchAll(MARKER_RE)].map((m) => ({ kind: m[1], value: m[2] }));
}

export function isBot(author) {
  return Boolean(author && BOT_LOGINS.includes(author.login));
}

export function readBotState(comments) {
  const state = { sameAs: null, notSame: new Set(), relatedCommentId: null };
  for (const c of comments || []) {
    if (!isBot(c.author)) continue;
    for (const { kind, value } of readMarkers(c.body)) {
      const n = Number(value);
      if (kind === "same-as" && Number.isInteger(n)) state.sameAs = n;
      else if (kind === "not-same" && Number.isInteger(n)) {
        state.notSame.add(n);
        if (state.sameAs === n) state.sameAs = null;
      } else if (kind === "related") state.relatedCommentId = c.id ?? null;
    }
  }
  return state;
}

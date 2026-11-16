// Hidden markers in the bot's own comments record links and suggestions.
// They are trusted ONLY from bot authors, so nobody can forge a link by pasting one.

export const BOT_LOGINS = ["github-actions", "github-actions[bot]"];

export function marker(kind, value) {
  return value === undefined ? `<!-- wishmap:${kind} -->` : `<!-- wishmap:${kind}=${value} -->`;
}

// A marker counts only when it is the whole last non-empty line of a bot comment
// (every bot string ends with exactly one). User text echoed earlier in the body can't count.
const MARKER_LINE_RE = /^<!-- wishmap:([a-z-]+)(?:=(\d+))? -->$/;

export function readMarkers(body) {
  const lines = String(body ?? "").replace(/\r\n/g, "\n").trimEnd().split("\n");
  const m = lines[lines.length - 1].trim().match(MARKER_LINE_RE);
  return m ? [{ kind: m[1], value: m[2] }] : [];
}

// Neutralise comment syntax in user-supplied text before the bot echoes it.
export function neutralize(text) {
  return String(text ?? "").replace(/<!--/g, "&lt;!--").replace(/-->/g, "--&gt;");
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

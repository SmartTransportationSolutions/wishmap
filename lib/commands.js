// Parse "/command" lines from a comment, plus helpers for permission and loop checks.

export const COMMANDS = ["same-as", "not-same", "needs", "unneed", "claim", "unclaim", "status"];
export const LINK_COMMANDS = ["same-as", "not-same", "needs", "unneed"];
export const STATUS_VALUES = ["idea", "planned", "in-progress", "done", "wont-do"];
const LEAD_ROLES = ["triage", "write", "maintain", "admin"];

export function parseCommands(body) {
  const out = [];
  let fenced = false;
  for (const rawLine of String(body ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (/^(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || line.startsWith(">") || !line.startsWith("/")) continue;
    const m = line.match(/^\/([A-Za-z][A-Za-z-]*)(?=\s|$)\s*(.*)$/);
    if (!m) continue; // e.g. a pasted path like /Users/x/file
    const cmd = m[1].toLowerCase();
    const rest = m[2].trim();
    if (!COMMANDS.includes(cmd)) {
      out.push({ cmd: "unknown", arg: null, raw: line });
      continue;
    }
    if (LINK_COMMANDS.includes(cmd)) {
      const num = rest.match(/^#?(\d+)\b/);
      out.push(num ? { cmd, arg: Number(num[1]), raw: line } : { cmd: "unknown", arg: null, raw: line });
    } else if (cmd === "status") {
      out.push({ cmd, arg: (rest.split(/\s+/)[0] || "").toLowerCase(), raw: line });
    } else {
      out.push({ cmd, arg: null, raw: line });
    }
  }
  return out;
}

export function isLead(role) {
  return LEAD_ROLES.includes(role);
}

// Would "from needs to" close a cycle? True if `to` already (transitively) needs `from`.
export async function wouldCreateLoop(from, to, getNeeds) {
  if (from === to) return true;
  const seen = new Set();
  const stack = [to];
  while (stack.length) {
    const n = stack.pop();
    if (n === from) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const next of await getNeeds(n)) stack.push(next);
  }
  return false;
}

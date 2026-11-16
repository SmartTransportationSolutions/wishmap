// Parse a GitHub issue-form body ("### <label>\n\n<value>" sections) into wish fields.
// Falls back to treating the whole body as the problem text when no form headings are found.
import { FIELDS, STARTED } from "../shared/form-schema.js";

const NO_RESPONSE = "_No response_";

function clean(v) {
  const t = (v || "").trim();
  return t === NO_RESPONSE ? "" : t;
}

export function parseWishBody(body) {
  const text = typeof body === "string" ? body.replace(/\r\n/g, "\n") : "";
  const found = {};
  const parts = text.split(/^### /m);
  for (const part of parts.slice(1)) {
    const nl = part.indexOf("\n");
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim();
    const value = nl === -1 ? "" : part.slice(nl + 1);
    const field = FIELDS.find((f) => f.label === heading);
    if (field) found[field.id] = clean(value);
  }

  if (Object.keys(found).length === 0) {
    return { problem: text.trim(), done: "", tools: "", area: null, time: null, startedByAuthor: false, complete: false };
  }

  const slugOf = (id) => {
    const field = FIELDS.find((f) => f.id === id);
    const hit = field.options.find((o) => o.label === found[id]);
    return hit ? hit.slug : null;
  };

  const required = FIELDS.filter((f) => f.required).map((f) => f.id);
  return {
    problem: found.problem ?? "",
    done: found.done ?? "",
    tools: found.tools ?? "",
    area: slugOf("area"),
    time: slugOf("time"),
    startedByAuthor: found.started === STARTED.yes,
    complete: required.every((id) => id in found),
  };
}

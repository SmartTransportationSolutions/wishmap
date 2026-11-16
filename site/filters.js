// Filtering + sorting (pure, tested in Node) and the filter bar (DOM).
import { T } from "./strings.ka.js";
import { AREAS } from "./shared/form-schema.js";

export const TIME_RANK = { "5h+": 3, "1-5h": 2, lt1h: 1, rare: 1.5 };

export function emptyFilters() {
  return { q: "", statuses: new Set(), areas: new Set(), project: null, person: null, showWontDo: false };
}

const norm = (s) => String(s ?? "").normalize("NFC").toLowerCase().trim();

export function applyFilters(wishes, f) {
  const q = norm(f.q);
  const num = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;
  return wishes.filter((w) => {
    if (!f.showWontDo && w.status === "wont-do" && !f.statuses.has("wont-do")) return false;
    if (f.statuses.size && !f.statuses.has(w.status)) return false;
    if (f.areas.size && !f.areas.has(w.area)) return false;
    if (f.project != null && w.project !== f.project) return false;
    if (f.person && !(w.people || []).includes(f.person) && w.owner !== f.person) return false;
    if (num !== null) return w.n === num;
    if (q && !norm(`${w.title} ${w.problem} ${w.tools}`).includes(q)) return false;
    return true;
  });
}

const AREA_ORDER = Object.fromEntries(AREAS.map((a, i) => [a.slug, i]));
const KEYS = {
  demand: (w) => (w.people || []).length,
  time: (w) => TIME_RANK[w.time] ?? 0,
  status: (w) => T.statusOrder.indexOf(w.status),
  area: (w) => AREA_ORDER[w.area] ?? 99,
  owner: (w) => w.owner || "￿",
  project: (w) => w.project ?? Infinity,
  n: (w) => w.n,
};

export function sortWishes(wishes, key = "demand", dir = "desc") {
  const get = KEYS[key] || KEYS.demand;
  const sign = dir === "asc" ? 1 : -1;
  return [...wishes].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (key === "project" && (x === Infinity || y === Infinity)) {
      if (x !== y) return x === Infinity ? 1 : -1; // empty projects always last
    } else if (x !== y) {
      return (x < y ? -1 : 1) * sign;
    }
    return a.n - b.n;
  });
}

// ---------- DOM ----------

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function select(label, options, value, onChange) {
  const s = el("select");
  s.setAttribute("aria-label", label);
  const any = el("option", "", `${label}: ${T.any}`);
  any.value = "";
  s.append(any);
  for (const [v, text] of options) {
    const o = el("option", "", text);
    o.value = String(v);
    if (String(value ?? "") === String(v)) o.selected = true;
    s.append(o);
  }
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

export function renderFilters(root, state, ctx) {
  const data = state.data;
  const f = state.filters;
  root.innerHTML = "";

  const search = el("input");
  search.type = "search";
  search.placeholder = T.search;
  search.setAttribute("aria-label", T.search);
  search.value = f.q;
  search.addEventListener("input", () => {
    f.q = search.value;
    update();
  });

  const chips = el("div", "chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", T.filterStatus);
  for (const s of T.statusOrder) {
    if (s === "wont-do") continue;
    const c = el("button", "chip");
    c.type = "button";
    const dot = el("span", "dot");
    dot.style.background = `var(--s-${s})`;
    c.append(dot, document.createTextNode(`${T.status[s]} · ${state.counts[s]}`));
    c.setAttribute("aria-pressed", String(f.statuses.has(s)));
    c.addEventListener("click", () => {
      f.statuses.has(s) ? f.statuses.delete(s) : f.statuses.add(s);
      c.setAttribute("aria-pressed", String(f.statuses.has(s)));
      update();
    });
    chips.append(c);
  }

  const area = select(T.filterArea, AREAS.map((a) => [a.slug, a.label]), [...f.areas][0], (v) => {
    f.areas = v ? new Set([v]) : new Set();
    update();
  });
  const project = select(T.filterProject, data.projects.map((p) => [p.n, p.title]), f.project, (v) => {
    f.project = v ? Number(v) : null;
    update();
  });
  const people = Object.keys(data.people).sort((a, b) => a.localeCompare(b));
  const person = select(T.filterPerson, people.map((l) => [l, l]), f.person, (v) => {
    f.person = v || null;
    update();
  });

  const wont = el("label", "check");
  const box = el("input");
  box.type = "checkbox";
  box.checked = f.showWontDo;
  box.addEventListener("change", () => {
    f.showWontDo = box.checked;
    update();
  });
  wont.append(box, el("span", "", `${T.showWontDo} · ${state.counts["wont-do"]}`));

  const clear = el("button", "linkish", T.clearFilters);
  clear.type = "button";
  clear.addEventListener("click", () => {
    state.filters = emptyFilters();
    ctx.rerender();
  });
  const note = el("span", "count-note");

  root.append(search, chips, area, project, person, wont, clear, note);

  function update() {
    note.textContent = T.shown(applyFilters(data.wishes, state.filters).length, data.wishes.length);
    ctx.refreshView();
  }
  note.textContent = T.shown(applyFilters(data.wishes, f).length, data.wishes.length);
}

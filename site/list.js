// List tab: a sortable, filterable table of wishes (cards on narrow screens).
import { T } from "./strings.ka.js";
import { AREAS, TIMES } from "./shared/form-schema.js";

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const areaLabel = (slug) => AREAS.find((a) => a.slug === slug)?.label ?? T.none;
const timeLabel = (slug) => TIMES.find((t) => t.slug === slug)?.label ?? T.none;

export function avatarEl(login, people, { initials = 2 } = {}) {
  const a = el("span", "avatar");
  a.title = login;
  const url = people?.[login]?.avatar;
  if (url) {
    const img = el("img");
    img.src = url;
    img.alt = login;
    img.loading = "lazy";
    a.append(img);
  } else {
    a.textContent = login.slice(0, initials).toUpperCase();
  }
  return a;
}

export function statusPill(status) {
  const p = el("span", "pill");
  const dot = el("span", "dot");
  dot.style.background = `var(--s-${status})`;
  p.append(dot, document.createTextNode(T.status[status] ?? status));
  return p;
}

const COLUMNS = [
  ["n", T.colN],
  [null, T.colTitle],
  ["demand", T.colDemand],
  ["time", T.colTime],
  ["status", T.colStatus],
  ["area", T.colArea],
  ["owner", T.colOwner],
  ["project", T.colProject],
];

export function renderList(root, wishes, { data, sort, onSort, onSelect }) {
  root.innerHTML = "";
  if (!wishes.length) {
    root.append(el("p", "muted no-matches", T.noMatches));
    return;
  }
  const wrap = el("div", "list card");
  const table = el("table", "wish-table");
  const head = el("tr");
  for (const [key, label] of COLUMNS) {
    const th = el("th");
    th.scope = "col";
    if (key) {
      const b = el("button", "sort", label);
      b.type = "button";
      const active = sort.key === key;
      if (active) b.append(el("span", "arrow", sort.dir === "asc" ? " ↑" : " ↓"));
      th.setAttribute("aria-sort", active ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
      b.addEventListener("click", () => onSort(key));
      th.append(b);
    } else {
      th.textContent = label;
    }
    head.append(th);
  }
  const thead = el("thead");
  thead.append(head);
  const tbody = el("tbody");
  const projectTitle = (n) => data.projects.find((p) => p.n === n)?.title ?? T.none;

  for (const w of wishes) {
    const tr = el("tr");
    tr.dataset.n = String(w.n);
    tr.append(el("td", "num", `#${w.n}`));

    const titleCell = el("td", "title");
    const open = el("button", "row-open", w.title);
    open.type = "button";
    open.addEventListener("click", () => onSelect(w.n));
    titleCell.append(open);
    if (w.mergedFrom?.length) titleCell.append(el("span", "merged", ` +${w.mergedFrom.length}`));
    tr.append(titleCell);

    const demand = el("td", "demand");
    demand.title = T.peopleWant(w.people.length);
    const stack = el("span", "stack");
    for (const login of w.people.slice(0, 4)) stack.append(avatarEl(login, data.people, { initials: 1 }));
    demand.append(el("strong", "", String(w.people.length)), stack);
    tr.append(demand);

    tr.append(el("td", "time", timeLabel(w.time)));
    const st = el("td", "status");
    st.append(statusPill(w.status));
    tr.append(st);
    tr.append(el("td", "area", areaLabel(w.area)));
    const owner = el("td", "owner");
    if (w.owner) owner.append(avatarEl(w.owner, data.people), document.createTextNode(` ${w.owner}`));
    else owner.textContent = T.none;
    tr.append(owner);
    tr.append(el("td", "project", w.project ? projectTitle(w.project) : T.none));
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      onSelect(w.n);
    });
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrap.append(table);
  root.append(wrap);
}

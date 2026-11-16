// App state + page shell. createState/relativeTime are DOM-free (tested in Node);
// renderApp builds the page and delegates tabs to view renderers passed in by main.js.
import { T } from "./strings.ka.js";

export function createState(mapData) {
  const counts = Object.fromEntries(T.statusOrder.map((s) => [s, 0]));
  for (const w of mapData?.wishes || []) if (w.status in counts) counts[w.status]++;
  return {
    data: mapData,
    noData: !mapData,
    emptyState: !mapData || mapData.wishes.length === 0,
    counts,
    filters: { q: "", statuses: new Set(), areas: new Set(), project: null, person: null, showWontDo: false },
    sort: { key: "demand", dir: "desc" },
    tab: "map",
    selected: null,
  };
}

export function relativeTime(iso, now = new Date()) {
  const s = Math.max(0, Math.round((now - new Date(iso)) / 1000));
  if (s < 60) return T.justNow;
  if (s < 3600) return T.minutesAgo(Math.floor(s / 60));
  if (s < 86400) return T.hoursAgo(Math.floor(s / 3600));
  return T.daysAgo(Math.floor(s / 86400));
}

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function emptyCard(state) {
  const card = el("section", "card empty");
  card.append(el("div", "empty-bubbles"));
  card.append(el("h2", "", state.noData ? T.noDataTitle : T.emptyTitle));
  card.append(el("p", "muted", state.noData ? T.noDataBody : T.emptyBody));
  if (!state.noData) {
    const a = el("a", "btn primary", T.addWish);
    a.href = state.data.newWishUrl;
    a.target = "_blank";
    a.rel = "noopener";
    card.append(a);
  }
  return card;
}

// views: { map(el, state, ctx), list(el, state, ctx), filters?(el, state, ctx), panel?(el, state, ctx) }
export function renderApp(root, state, { views = {}, onLock } = {}) {
  root.innerHTML = "";
  const header = el("header", "top");
  const brand = el("div", "brand");
  brand.append(el("h1", "", T.appTitle), el("p", "muted", T.appSubtitle));
  const actions = el("div", "actions");
  if (state.data) actions.append(el("span", "updated", `${T.updated}: ${relativeTime(state.data.generatedAt)}`));
  if (onLock) {
    const lock = el("button", "btn ghost", T.lock);
    lock.type = "button";
    lock.addEventListener("click", onLock);
    actions.append(lock);
  }
  if (state.data) {
    const add = el("a", "btn primary", T.addWish);
    add.href = state.data.newWishUrl;
    add.target = "_blank";
    add.rel = "noopener";
    actions.append(add);
  }
  header.append(brand, actions);
  root.append(header);

  if (state.emptyState) {
    root.append(emptyCard(state));
    return;
  }

  const tabs = el("nav", "tabs");
  tabs.setAttribute("role", "tablist");
  for (const [id, label] of [["map", T.tabMap], ["list", T.tabList]]) {
    const b = el("button", "tab", label);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(state.tab === id));
    b.addEventListener("click", () => {
      state.tab = id;
      renderApp(root, state, { views, onLock });
    });
    tabs.append(b);
  }
  const filters = el("section", "filters");
  const stage = el("section", `stage stage-${state.tab}`);
  const view = el("div", "view");
  const panel = el("aside", "panel");
  panel.hidden = true;
  stage.append(view, panel);
  root.append(tabs, filters, stage);

  const ctx = {
    rerender: () => renderApp(root, state, { views, onLock }),
    refreshView: () => {
      view.innerHTML = "";
      views[state.tab]?.(view, state, ctx);
    },
    select: (n) => {
      state.selected = n;
      if (views.panel) views.panel(panel, state, ctx);
    },
  };
  views.filters?.(filters, state, ctx);
  ctx.refreshView();
  if (state.selected != null) ctx.select(state.selected);
}

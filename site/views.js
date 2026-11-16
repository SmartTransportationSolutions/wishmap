// View registry used by main.js.
import { applyFilters, sortWishes, renderFilters } from "./filters.js";
import { renderList } from "./list.js";
import { createMap } from "./map.js";
import { renderPanel, closePanel } from "./panel.js";

const ASC_FIRST = new Set(["n", "project", "area", "owner"]);
let map = null;
let resizeBound = false;

export const views = {
  filters: renderFilters,

  list(el, state, ctx) {
    map = null;
    const shown = sortWishes(applyFilters(state.data.wishes, state.filters), state.sort.key, state.sort.dir);
    renderList(el, shown, {
      data: state.data,
      sort: state.sort,
      onSort: (key) => {
        state.sort = state.sort.key === key ? { key, dir: state.sort.dir === "asc" ? "desc" : "asc" } : { key, dir: ASC_FIRST.has(key) ? "asc" : "desc" };
        ctx.refreshView();
      },
      onSelect: (n) => ctx.select(n),
    });
  },

  map(el, state, ctx) {
    if (!globalThis.d3) {
      el.textContent = "…";
      return;
    }
    const shown = applyFilters(state.data.wishes, state.filters);
    const projects = state.data.projects.filter((p) => state.filters.project == null || p.n === state.filters.project);
    map = createMap(el, { data: state.data, onSelect: (n) => ctx.select(n) });
    map.update(shown, projects);
    if (!resizeBound) {
      resizeBound = true;
      let t;
      window.addEventListener("resize", () => {
        clearTimeout(t);
        t = setTimeout(() => state.tab === "map" && ctx.refreshView(), 250);
      });
    }
  },

  panel(el, state, ctx) {
    const wish = state.data.wishes.find((w) => w.n === state.selected);
    if (!wish) {
      closePanel(el);
      return;
    }
    renderPanel(el, wish, state.data, {
      onPick: (n) => {
        ctx.select(n);
        map?.focus(n);
      },
      onClose: () => {
        state.selected = null;
        closePanel(el);
      },
    });
  },
};

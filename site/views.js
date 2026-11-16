// View registry used by main.js.
import { applyFilters, sortWishes, renderFilters } from "./filters.js";
import { renderList } from "./list.js";

export const views = {
  filters: renderFilters,
  list(el, state, ctx) {
    const shown = sortWishes(applyFilters(state.data.wishes, state.filters), state.sort.key, state.sort.dir);
    renderList(el, shown, {
      data: state.data,
      sort: state.sort,
      onSort: (key) => {
        state.sort = state.sort.key === key ? { key, dir: state.sort.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "n" || key === "project" || key === "area" || key === "owner" ? "asc" : "desc" };
        ctx.refreshView();
      },
      onSelect: (n) => ctx.select(n),
    });
  },
  map(el, state) {
    el.textContent = `${applyFilters(state.data.wishes, state.filters).length}`;
  },
};

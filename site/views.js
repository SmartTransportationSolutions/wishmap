// View registry used by main.js. Tasks 15/16 fill in filters, list, map and panel.
export const views = {
  map(el, state) {
    el.textContent = `${state.data.wishes.length}`;
  },
  list(el, state) {
    el.textContent = `${state.data.wishes.length}`;
  },
};

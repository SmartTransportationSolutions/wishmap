// Browser entry point: unlock → build state → render the shell with its views.
import { initUnlock, createAskForm, browserStorage, openIdb, fetchEnvelope, forgetKeys } from "./unlock.js";
import { createState, renderApp } from "./app.js";
import { views } from "./views.js";

const root = document.getElementById("app");
const storage = browserStorage();
const idb = openIdb();

const data = await initUnlock({ fetchEnvelope, storage, idb, ask: createAskForm(root) });
const state = createState(data);
if (window.matchMedia("(max-width: 640px)").matches) state.tab = "list";
renderApp(root, state, {
  views,
  onLock: data
    ? async () => {
        await forgetKeys(storage, idb);
        location.reload();
      }
    : undefined,
});

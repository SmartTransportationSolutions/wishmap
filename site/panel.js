// Side panel with everything about one wish. All text goes through textContent.
import { T } from "./strings.ka.js";
import { AREAS, TIMES } from "./shared/form-schema.js";
import { avatarEl, statusPill } from "./list.js";

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function section(label, content) {
  const s = el("section", "p-sec");
  s.append(el("h3", "", label));
  if (typeof content === "string") s.append(el("p", "", content || T.none));
  else s.append(content);
  return s;
}

function wishLinks(ns, data, onPick) {
  const wrap = el("div", "p-links");
  if (!ns.length) {
    wrap.textContent = T.none;
    return wrap;
  }
  for (const n of ns) {
    const w = data.wishes.find((x) => x.n === n);
    const b = el("button", "p-link", w ? `#${n} ${w.title}` : `#${n}`);
    b.type = "button";
    b.addEventListener("click", () => onPick(n));
    wrap.append(b);
  }
  return wrap;
}

export function closePanel(root) {
  root.hidden = true;
  root.innerHTML = "";
}

export function renderPanel(root, wish, data, { onPick, onClose }) {
  root.innerHTML = "";
  if (!wish) return closePanel(root);
  root.hidden = false;

  const head = el("div", "p-head");
  const close = el("button", "p-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", T.close);
  close.addEventListener("click", onClose);
  head.append(el("span", "num", `#${wish.n}`), statusPill(wish.status), close);
  root.append(head, el("h2", "p-title", wish.title));

  const actions = el("div", "p-actions");
  const open = el("a", "btn ghost", T.openInGitHub);
  open.href = wish.url;
  open.target = "_blank";
  open.rel = "noopener";
  const metoo = el("a", "btn primary", T.meToo);
  metoo.href = wish.url;
  metoo.target = "_blank";
  metoo.rel = "noopener";
  actions.append(metoo, open);
  root.append(actions);

  const people = el("div", "p-people");
  for (const login of wish.people) {
    const chip = el("span", "p-person");
    chip.append(avatarEl(login, data.people), document.createTextNode(login));
    people.append(chip);
  }
  root.append(section(`${T.panelPeople} · ${wish.people.length}`, people));

  const owner = el("div", "p-people");
  if (wish.owner) {
    const chip = el("span", "p-person");
    chip.append(avatarEl(wish.owner, data.people), document.createTextNode(wish.owner));
    owner.append(chip);
  } else owner.textContent = T.panelNobody;
  root.append(section(T.panelOwner, owner));

  root.append(section(T.panelProblem, wish.problem));
  root.append(section(T.panelDone, wish.done));
  const meta = el("dl", "p-meta");
  for (const [k, v] of [
    [T.panelArea, AREAS.find((a) => a.slug === wish.area)?.label],
    [T.panelTime, TIMES.find((t) => t.slug === wish.time)?.label],
    [T.panelTools, wish.tools],
  ]) {
    meta.append(el("dt", "", k), el("dd", "", v || T.none));
  }
  root.append(meta);

  if (wish.project) {
    const p = data.projects.find((x) => x.n === wish.project);
    const box = el("div", "p-project");
    if (p) {
      const a = el("a", "", p.title);
      a.href = p.url;
      a.target = "_blank";
      a.rel = "noopener";
      const bar = el("div", "bar");
      const fill = el("span");
      fill.style.width = `${p.tasks.total ? Math.round((p.tasks.done / p.tasks.total) * 100) : 0}%`;
      bar.append(fill);
      box.append(a, statusPill(p.status), bar, el("small", "", T.panelTasks(p.tasks.done, p.tasks.total)));
    }
    root.append(section(T.panelProject, box));
  }
  root.append(section(T.panelNeeds, wishLinks(wish.needs, data, onPick)));
  root.append(section(T.panelNeededBy, wishLinks(wish.neededBy, data, onPick)));
  if (wish.mergedFrom.length) root.append(section(T.panelMerged, wish.mergedFrom.map((n) => `#${n}`).join(", ")));
  close.focus();
}

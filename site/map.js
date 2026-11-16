// "Beautiful bubbles" connection map. Pure helpers are tested in Node; createMap uses the
// global d3 (vendored) and is only called in the browser.
import { T } from "./strings.ka.js";

const seg = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("ka", { granularity: "grapheme" }) : null;
const graphemes = (s) => (seg ? [...seg.segment(String(s ?? ""))].map((x) => x.segment) : Array.from(String(s ?? "")));

export function bubbleRadius(people) {
  return Math.max(14, Math.min(56, 10 + 9 * Math.sqrt(people)));
}

export function truncateLabel(title, maxGraphemes = 28) {
  const g = graphemes(title);
  return g.length <= maxGraphemes ? g.join("") : g.slice(0, maxGraphemes - 1).join("").trimEnd() + "…";
}

// Greedy word wrap into ≤ 2 lines of ≤ maxPerLine graphemes; the 2nd line is truncated.
export function wrapLabel(title, maxPerLine) {
  const words = String(title ?? "").split(/\s+/).filter(Boolean);
  const len = (s) => graphemes(s).length;
  let first = "";
  let i = 0;
  for (; i < words.length; i++) {
    const next = first ? `${first} ${words[i]}` : words[i];
    if (len(next) > maxPerLine && first) break;
    first = next;
  }
  if (len(first) > maxPerLine) first = truncateLabel(first, maxPerLine);
  const rest = words.slice(i).join(" ");
  return rest ? [first, truncateLabel(rest, maxPerLine)] : [first];
}

export function projectHull(members) {
  const cx = members.reduce((s, m) => s + m.x, 0) / members.length;
  const cy = members.reduce((s, m) => s + m.y, 0) / members.length;
  const r = Math.max(...members.map((m) => Math.hypot(m.x - cx, m.y - cy) + m.r)) + 18;
  return { cx, cy, r };
}

// ---------- browser only ----------

export function createMap(root, { data, onSelect }) {
  const d3 = globalThis.d3;
  root.innerHTML = "";
  const box = document.createElement("div");
  box.className = "map card";
  root.append(box);
  const width = Math.max(320, box.clientWidth || root.clientWidth || 960);
  const top = box.getBoundingClientRect().top;
  const height = Math.round(Math.max(480, Math.min(860, window.innerHeight - Math.max(0, top) - 28)));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const svg = d3.select(box).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height).attr("role", "img").attr("aria-label", T.tabMap);
  const defs = svg.append("defs");
  defs.append("marker").attr("id", "arrow").attr("viewBox", "0 -5 10 10").attr("refX", 9).attr("refY", 0).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto")
    .append("path").attr("d", "M0,-4L9,0L0,4").attr("fill", "var(--link)");
  const shine = defs.append("radialGradient").attr("id", "shine").attr("cx", "35%").attr("cy", "30%").attr("r", "70%");
  shine.append("stop").attr("offset", "0%").attr("stop-color", "#fff").attr("stop-opacity", 0.35);
  shine.append("stop").attr("offset", "60%").attr("stop-color", "#fff").attr("stop-opacity", 0.05);
  shine.append("stop").attr("offset", "100%").attr("stop-color", "#fff").attr("stop-opacity", 0);

  const world = svg.append("g");
  const gHull = world.append("g").attr("class", "hulls");
  const gLink = world.append("g").attr("class", "links");
  const gNode = world.append("g").attr("class", "nodes");
  const zoom = d3.zoom().scaleExtent([0.3, 3]).on("zoom", (e) => world.attr("transform", e.transform));
  svg.call(zoom).on("dblclick.zoom", null);

  // Legend
  const legend = document.createElement("div");
  legend.className = "legend";
  for (const s of T.statusOrder) {
    if (s === "wont-do") continue;
    const item = document.createElement("span");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = `var(--s-${s})`;
    item.append(dot, document.createTextNode(T.status[s]));
    legend.append(item);
  }
  const sizeNote = document.createElement("span");
  sizeNote.className = "legend-note";
  sizeNote.textContent = `${T.legendSize} · ${T.legendNeeds}`;
  legend.append(sizeNote);
  box.append(legend);

  let nodesById = new Map();

  function update(wishes, projects) {
    const visible = new Set(wishes.map((w) => w.n));
    const nodes = wishes.map((w) => ({ ...w, r: bubbleRadius(w.people.length) }));
    nodesById = new Map(nodes.map((n) => [n.n, n]));
    const links = nodes.flatMap((w) => w.needs.filter((n) => visible.has(n)).map((n) => ({ source: w.n, target: n })));

    // Anchors: projects on a ring, loose wishes in the middle.
    const used = projects.filter((p) => nodes.some((n) => n.project === p.n));
    const cx = width / 2;
    const cy = height / 2;
    const ring = Math.min(width, height) * (used.length > 1 ? 0.24 : 0);
    const anchor = new Map(used.map((p, i) => {
      const a = (i / used.length) * 2 * Math.PI - Math.PI / 2;
      return [p.n, { x: cx + ring * Math.cos(a) * (width / height > 1.3 ? 1.35 : 1), y: cy + ring * Math.sin(a) }];
    }));
    const home = (d) => anchor.get(d.project) || { x: cx, y: cy };

    for (const n of nodes) {
      const h = home(n);
      n.x = h.x + (Math.random() - 0.5) * 40;
      n.y = h.y + (Math.random() - 0.5) * 40;
    }
    const sim = d3.forceSimulation(nodes)
      .force("collide", d3.forceCollide((d) => d.r + 7).iterations(3))
      .force("charge", d3.forceManyBody().strength(-28))
      .force("link", d3.forceLink(links).id((d) => d.n).distance(80).strength(0.04))
      .force("x", d3.forceX((d) => home(d).x).strength((d) => (d.project ? 0.12 : 0.03)))
      .force("y", d3.forceY((d) => home(d).y).strength((d) => (d.project ? 0.12 : 0.05)))
      .stop();
    // Keep bubbles out of projects they don't belong to (circle + its title band above).
    const groups = used.map((p) => nodes.filter((n) => n.project === p.n));
    const avoidHulls = (alpha) => {
      for (const members of groups) {
        const h = projectHull(members);
        for (const n of nodes) {
          if (n.project != null && members.includes(n)) continue;
          const dx = n.x - h.cx;
          const dy = n.y - (h.cy - 12);
          const dist = Math.hypot(dx, dy) || 1;
          const min = h.r + n.r + 30;
          if (dist < min) {
            const push = ((min - dist) / dist) * Math.max(alpha, 0.3);
            n.x += dx * push;
            n.y += dy * push;
          }
        }
      }
    };
    for (let i = 0; i < 300; i++) {
      sim.tick();
      avoidHulls(sim.alpha());
    }

    let fitK = 1;
    const hullData = used.map((p) => ({ p, members: nodes.filter((n) => n.project === p.n) }));
    const hulls = gHull.selectAll("g.hull").data(hullData, (d) => d.p.n).join((enter) => {
      const g = enter.append("g").attr("class", "hull");
      g.append("circle");
      g.append("text").attr("text-anchor", "middle");
      return g;
    });
    const drawHulls = () => {
      hulls.each(function (d) {
        const h = projectHull(d.members);
        const g = d3.select(this);
        g.select("circle").attr("cx", h.cx).attr("cy", h.cy).attr("r", h.r);
        g.select("text").attr("x", h.cx).attr("y", h.cy - h.r - 8).text(truncateLabel(d.p.title, 34));
      });
    };

    const linkSel = gLink.selectAll("path").data(links).join("path").attr("marker-end", "url(#arrow)");
    const drawLinks = () => {
      linkSel.attr("d", (l) => {
        const s = l.source;
        const t = l.target;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.hypot(dx, dy) || 1;
        const sx = s.x + (dx / dist) * (s.r + 2);
        const sy = s.y + (dy / dist) * (s.r + 2);
        const tx = t.x - (dx / dist) * (t.r + 4);
        const ty = t.y - (dy / dist) * (t.r + 4);
        const mx = (sx + tx) / 2 - (dy / dist) * dist * 0.15;
        const my = (sy + ty) / 2 + (dx / dist) * dist * 0.15;
        return `M${sx},${sy}Q${mx},${my} ${tx},${ty}`;
      });
    };

    const nodeSel = gNode.selectAll("g.bubble").data(nodes, (d) => d.n).join((enter) => {
      const g = enter.append("g").attr("class", "bubble").attr("tabindex", 0).attr("role", "button");
      g.append("circle").attr("class", "fill");
      g.append("circle").attr("class", "shine").attr("fill", "url(#shine)");
      g.append("text").attr("class", "label").attr("text-anchor", "middle");
      const badge = g.append("g").attr("class", "badge");
      badge.append("circle").attr("r", 10);
      badge.append("text").attr("text-anchor", "middle").attr("dy", "0.35em");
      g.append("title");
      return g;
    });
    nodeSel.attr("data-status", (d) => d.status).attr("aria-label", (d) => `#${d.n} ${d.title} — ${T.status[d.status]}, ${T.peopleWant(d.people.length)}`);
    nodeSel.select("circle.fill").attr("r", (d) => d.r).attr("fill", (d) => `var(--s-${d.status})`);
    nodeSel.select("circle.shine").attr("r", (d) => d.r);
    nodeSel.select("title").text((d) => `#${d.n} ${d.title}`);
    nodeSel.select("g.badge").attr("transform", (d) => `translate(${d.r * 0.72},${-d.r * 0.72})`);
    nodeSel.select("g.badge text").text((d) => d.people.length);
    const place = () => nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
    const redraw = () => {
      place();
      drawLinks();
      drawHulls();
    };
    redraw();

    // Fit everything (bubbles + project outlines and their names) into the frame.
    const boxes = [
      ...nodes.map((n) => [n.x - n.r, n.y - n.r, n.x + n.r, n.y + n.r]),
      ...hullData.map(({ members }) => {
        const h = projectHull(members);
        return [h.cx - h.r, h.cy - h.r - 26, h.cx + h.r, h.cy + h.r];
      }),
    ];
    if (boxes.length) {
      const x0 = Math.min(...boxes.map((b) => b[0]));
      const y0 = Math.min(...boxes.map((b) => b[1]));
      const x1 = Math.max(...boxes.map((b) => b[2]));
      const y1 = Math.max(...boxes.map((b) => b[3]));
      fitK = Math.min(2.4, (width - 48) / (x1 - x0), (height - 84) / (y1 - y0));
      const t = d3.zoomIdentity.translate(width / 2, (height - 40) / 2).scale(fitK).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      svg.call(zoom.transform, t);
    }

    // Labels are sized for the fitted on-screen scale: bubbles that are big on screen carry a
    // 2-line title; small ones show #n (full title in the tooltip and the panel).
    nodeSel.select("text.label").each(function (d) {
      const t = d3.select(this);
      t.selectAll("tspan").remove();
      const screenR = d.r * fitK;
      const roomy = screenR >= 30;
      const fsScreen = roomy ? Math.max(10.5, Math.min(13.5, screenR / 3.4)) : 11;
      const fs = fsScreen / fitK;
      const lines = roomy ? wrapLabel(d.title, Math.max(6, Math.floor((screenR * 1.6) / (fsScreen * 0.6)))) : [`#${d.n}`];
      t.attr("class", "label inside").style("font-size", `${fs}px`).style("fill", `var(--s-${d.status}-ink)`);
      const y0 = -((lines.length - 1) * fs * 1.15) / 2;
      lines.forEach((line, i) => t.append("tspan").attr("x", 0).attr("y", y0 + i * fs * 1.15).attr("dy", "0.35em").text(line));
    });
    // Keep badges and project names readable at the fitted scale too.
    nodeSel.select("g.badge circle").attr("r", 10 / Math.max(1, fitK * 0.8));
    nodeSel.select("g.badge text").style("font-size", `${10.5 / Math.max(1, fitK * 0.8)}px`);
    hulls.select("text").style("font-size", `${(width < 640 ? 10.5 : 13) / fitK}px`);

    // Hover: highlight a bubble and its links, show a tooltip.
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    box.append(tip);
    const neighbours = (d) => new Set([d.n, ...d.needs, ...d.neededBy]);
    const focusOn = (event, d) => {
      const keep = neighbours(d);
      nodeSel.classed("dim", (x) => !keep.has(x.n));
      linkSel.classed("dim", (l) => l.source.n !== d.n && l.target.n !== d.n).classed("hot", (l) => l.source.n === d.n || l.target.n === d.n);
      tip.textContent = "";
      const strong = document.createElement("strong");
      strong.textContent = `#${d.n} ${d.title}`;
      const meta = document.createElement("span");
      meta.textContent = `${T.status[d.status]} · ${T.peopleWant(d.people.length)}`;
      tip.append(strong, meta);
      const rect = box.getBoundingClientRect();
      const node = event.currentTarget.getBoundingClientRect();
      tip.hidden = false;
      const left = Math.min(rect.width - tip.offsetWidth - 8, Math.max(8, node.left - rect.left + node.width / 2 - tip.offsetWidth / 2));
      const topPos = node.top - rect.top - tip.offsetHeight - 8;
      tip.style.left = `${left}px`;
      tip.style.top = `${topPos < 8 ? node.bottom - rect.top + 8 : topPos}px`;
    };
    const clear = () => {
      nodeSel.classed("dim", false);
      linkSel.classed("dim", false).classed("hot", false);
      tip.hidden = true;
    };
    nodeSel.on("mouseenter focus", (e, d) => focusOn(e, d)).on("mouseleave blur", clear);
    nodeSel.on("click", (_, d) => onSelect(d.n)).on("keydown", (e, d) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(d.n);
      }
    });
    nodeSel.call(d3.drag().on("drag", (e, d) => {
      d.x = e.x;
      d.y = e.y;
      redraw();
    }));

    if (!reduce) {
      nodeSel.style("opacity", 0).transition().duration(450).delay((_, i) => i * 12).style("opacity", null);
    }
  }

  function focus(n) {
    const d = nodesById.get(n);
    if (!d) return;
    svg.transition().duration(reduce ? 0 : 500).call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(1.4).translate(-d.x, -d.y));
    gNode.selectAll("g.bubble").classed("selected", (x) => x.n === n);
  }

  return { update, focus };
}

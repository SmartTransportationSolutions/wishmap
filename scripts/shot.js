// Dev-only screenshot helper: headless Chrome via the DevTools protocol (no dependencies).
// Usage: node scripts/shot.js <out.png> [--w 1280] [--h 860] [--dark] [--pass test-passphrase] [--eval "js after unlock"] [--url http://localhost:5173/]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};
const out = args[0];
const W = Number(opt("w", 1280));
const H = Number(opt("h", 860));
const dark = args.includes("--dark");
const pass = opt("pass", "test-passphrase");
const after = opt("eval", "");
const url = opt("url", "http://localhost:5173/");
const PORT = 9333 + Math.floor(Math.random() * 500);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "wishmap-shot-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
try {
  let pages;
  for (let i = 0; i < 50 && !pages; i++) {
    await sleep(200);
    pages = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).catch(() => null);
  }
  const ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + " " + (r.result.exceptionDetails.exception?.description || ""));
    return r.result?.result?.value;
  };

  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 640 });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url });
  await sleep(1200);
  if (pass) {
    // Wait for the unlock form (data.enc may load slowly over the network), submit, then wait
    // until the form is gone (PBKDF2 600k takes a moment) or an error shows.
    let state = "no-form";
    for (let i = 0; i < 50 && state === "no-form"; i++) {
      state = await evaluate(`(() => { const f = document.querySelector("form.unlock"); if (!f) return "no-form"; f.pass.value = ${JSON.stringify(pass)}; f.requestSubmit(); return "submitted"; })()`);
      if (state === "no-form") await sleep(200);
    }
    for (let i = 0; i < 75; i++) {
      const s = await evaluate(`(() => { const f = document.querySelector("form.unlock"); if (!f) return "unlocked"; const e = f.querySelector(".error"); return e && e.textContent ? "error" : "waiting"; })()`);
      if (s !== "waiting") { console.log(`unlock: ${s}`); break; }
      await sleep(200);
    }
    await sleep(800);
  }
  if (after) {
    await evaluate(after);
    await sleep(1500);
  }
  const errors = await evaluate("window.__errors || []").catch(() => []);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log(`saved ${out} (${W}x${H}${dark ? ", dark" : ""}) errors=${JSON.stringify(errors)}`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}

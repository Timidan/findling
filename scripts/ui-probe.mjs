/**
 * Interactive UI probe (CDP). Drives the running dev server like a user: loads a
 * route, enumerates every interactive element, and CLICKS each button in isolation
 * (reload between clicks) to observe what it actually does — navigation, network,
 * DOM change, console error, or NOTHING (a dead control).
 *
 *   node scripts/ui-probe.mjs /find /agents /            # probe these routes
 *   node scripts/ui-probe.mjs --all                       # probe a built-in public set
 *
 * Emits a JSON report to stdout and to /tmp/ui-probe/<report>.json. Exit code is
 * always 0 (it's a reporter, not a gate). Dev server must be on :3000.
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = "/tmp/ui-probe";
const BASE = "http://localhost:3000";
const PORT = 9224;
const CHROME = "/usr/bin/chromium";
mkdirSync(OUT, { recursive: true });

const PUBLIC_ROUTES = ["/", "/find", "/find?tab=available", "/find?tab=wanted", "/agents", "/studio", "/studio/earnings", "/earnings"];
const argv = process.argv.slice(2);
const routes = argv.length === 0 || argv[0] === "--all" ? PUBLIC_ROUTES : argv;

const profile = `/tmp/ui-probe-profile-${PORT}`;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
  "--disable-extensions", "about:blank",
], { stdio: "ignore" });

const getJSON = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();
async function waitPort() {
  for (let i = 0; i < 100; i++) { try { return await getJSON("/json/version"); } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error("chromium devtools never came up");
}
const version = await waitPort();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1; const pending = new Map(); const waiters = []; const listeners = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); }
  else if (msg.method) {
    for (const l of listeners) if (l.method === msg.method) l.fn(msg.params);
    for (let i = waiters.length - 1; i >= 0; i--) { if (waiters[i].method === msg.method) { waiters[i].resolve(msg.params); waiters.splice(i, 1); } }
  }
};
const send = (method, params = {}, sessionId) => { const id = nextId++; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); };
const waitEvent = (method, sessionId, timeout = 12000) => new Promise((resolve) => { const w = { method, resolve }; waiters.push(w); setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); resolve(null); } }, timeout); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId: S } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, S);
await send("Runtime.enable", {}, S);
await send("Network.enable", {}, S);
await send("Log.enable", {}, S);
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, S);

// Rolling capture of console errors + network requests, scoped per-window by the prober.
let consoleErrors = []; let requests = [];
listeners.push({ method: "Runtime.consoleAPICalled", fn: (p) => { if (p.type === "error") consoleErrors.push((p.args || []).map(a => a.value ?? a.description ?? "").join(" ").slice(0, 200)); } });
listeners.push({ method: "Log.entryAdded", fn: (p) => { if (p.entry?.level === "error") consoleErrors.push(String(p.entry.text).slice(0, 200)); } });
listeners.push({ method: "Network.requestWillBeSent", fn: (p) => { if (p.request?.url?.startsWith("http")) requests.push(p.request.method + " " + p.request.url.replace(BASE, "")); } });

async function evals(expr, sessionId = S) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text || "eval error" };
  return r.result?.value;
}
async function nav(path) {
  await send("Page.navigate", { url: BASE + path }, S);
  await waitEvent("Page.loadEventFired", S, 12000);
  await sleep(1200);
}

// Snapshot of interactive elements in document order (links read-only; buttons get clicked).
const SNAPSHOT = `(() => {
  const sel = 'a[href], button, [role=button], input[type=submit], input[type=button]';
  const els = [...document.querySelectorAll(sel)];
  return els.map((el, i) => {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const href = el.getAttribute('href');
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
    const disabled = el.disabled === true || el.getAttribute('aria-disabled') === 'true';
    const kind = (tag === 'a') ? 'link' : 'button';
    return { i, kind, tag, role, href, text, disabled };
  });
})()`;

const report = [];
for (const route of routes) {
  consoleErrors = []; requests = [];
  await nav(route);
  const loadErrors = [...consoleErrors];
  const snap = await evals(SNAPSHOT);
  const elements = Array.isArray(snap) ? snap : [];
  const findings = [];

  // Links: classify by href (no click).
  for (const el of elements.filter(e => e.kind === "link")) {
    const h = el.href || "";
    let verdict = "link";
    if (!h || h === "#" || h.startsWith("javascript:")) verdict = "DEAD_LINK";
    findings.push({ ...el, target: h, verdict });
  }

  // Buttons: isolate-probe each (reload, click index, observe).
  const buttons = elements.filter(e => e.kind === "button");
  const cap = Math.min(buttons.length, 24);
  for (let n = 0; n < cap; n++) {
    const btn = buttons[n];
    if (btn.disabled) { findings.push({ ...btn, verdict: "disabled" }); continue; }
    // fresh load to isolate state
    consoleErrors = []; requests = [];
    await nav(route);
    const STATE = `({ href: location.href, len: document.body.innerText.length, cls: document.documentElement.className, n: document.querySelectorAll('a,button,[role=button],input,dialog').length })`;
    const before = await evals(STATE);
    consoleErrors = []; requests = [];
    const clickRes = await evals(`(() => {
      const sel = 'a[href], button, [role=button], input[type=submit], input[type=button]';
      const els = [...document.querySelectorAll(sel)].filter(e => e.tagName.toLowerCase() !== 'a' || false ? true : true);
      const btns = [...document.querySelectorAll(sel)].filter(e => { const t=e.tagName.toLowerCase(); return t!=='a'; });
      const el = btns[${n}];
      if (!el) return { missing: true };
      el.click();
      return { clicked: true };
    })()`);
    await sleep(850);
    const after = await evals(STATE);
    const errs = [...consoleErrors];
    const reqs = requests.filter(r => !r.includes("/_next/") && !r.endsWith(".css") && !r.endsWith(".js") && !r.includes("favicon")).slice(0, 4);
    const urlChanged = before && after && before.href !== after.href;
    const domChanged = before && after && (Math.abs((before.len || 0) - (after.len || 0)) > 4 || before.cls !== after.cls || before.n !== after.n);
    let verdict;
    if (clickRes?.missing) verdict = "skip";
    else if (urlChanged) verdict = "navigates";
    else if (errs.length) verdict = "ERROR";
    else if (domChanged || reqs.length) verdict = "acts";
    else verdict = "DEAD_BUTTON";
    findings.push({ ...btn, verdict, urlAfter: urlChanged ? after.href.replace(BASE, "") : undefined, requests: reqs.length ? reqs : undefined, errors: errs.length ? errs.slice(0, 2) : undefined });
  }

  const dead = findings.filter(f => f.verdict === "DEAD_BUTTON" || f.verdict === "DEAD_LINK" || f.verdict === "ERROR");
  report.push({ route, elementCount: elements.length, buttonsProbed: cap, loadErrors, deadCount: dead.length, findings });
}

ws.close(); chrome.kill("SIGTERM");
const out = { base: BASE, probedAt: "dev", routes: report };
writeFileSync(`${OUT}/report.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(0);

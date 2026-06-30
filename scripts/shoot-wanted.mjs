/**
 * Focused screenshot of the public Wanted board + claim page (no auth needed).
 *   node scripts/shoot-wanted.mjs   (dev server must be on :3000)
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";

const OUT = "/tmp/ux";
const BASE = "http://localhost:3000";
const PORT = 9223;
const CHROME = "/usr/bin/chromium";
mkdirSync(OUT, { recursive: true });

const profile = "/tmp/ux-wanted-profile";
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
  "--force-color-profile=srgb", "--disable-extensions", "about:blank",
], { stdio: "ignore" });

const getJSON = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();
async function waitPort() {
  for (let i = 0; i < 100; i++) { try { return await getJSON("/json/version"); } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error("chromium devtools never came up");
}
const version = await waitPort();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1; const pending = new Map(); const waiters = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); }
  else if (msg.method) { for (let i = waiters.length - 1; i >= 0; i--) { if (waiters[i].method === msg.method) { waiters[i].resolve(msg.params); waiters.splice(i, 1); } } }
};
const send = (method, params = {}, sessionId) => { const id = nextId++; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); };
const waitEvent = (method, sessionId, timeout = 12000) => new Promise((resolve) => { const w = { method, resolve }; waiters.push(w); setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); resolve(null); } }, timeout); });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId: S } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, S); await send("Runtime.enable", {}, S);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, S);
async function nav(path, wait = 1800) { await send("Page.navigate", { url: BASE + path }, S); await waitEvent("Page.loadEventFired", S, 12000); await sleep(wait); }
async function shot(name, full = true) { const res = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full, fromSurface: true }, S); writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.data, "base64")); console.log("  ✓", `${OUT}/${name}.png`); }

const log = [];
try {
  await nav("/find", 2600); await shot("find-live");
  log.push("captured");
} catch (e) { log.push("ERROR " + (e?.message ?? e)); }
finally { ws.close(); chrome.kill("SIGTERM"); console.log(log.join("; ")); process.exit(0); }

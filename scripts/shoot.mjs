/**
 * Headless screenshot capture over raw CDP (no extension, no playwright dep).
 * Mints a valid findling_session cookie for the Dev Creator so studio pages
 * render authed, then captures every live page (desktop + key mobile).
 *   node --env-file=.env.local scripts/shoot.mjs
 */
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import postgres from "postgres";

const OUT = "/tmp/ux";
const BASE = "http://localhost:3000";
const PORT = 9222;
const CHROME = "/usr/bin/chromium";
mkdirSync(OUT, { recursive: true });

// ---- mint the session cookie (mirror of encodeSession in session.ts) ----
const secret = process.env.AUTH_SESSION_SECRET;
if (!secret) throw new Error("AUTH_SESSION_SECRET missing");
function encodeSession(p) {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const [creator] = await sql`select id, wallet_address from users where email=${"dev-creator@findling.local"} limit 1`;
const [run] = await sql`select id from agent_runs where payment_status=${"settled"} order by started_at desc limit 1`;
const [receipt] = await sql`select public_slug from receipts order by created_at desc limit 1`;
await sql.end();
if (!creator) throw new Error("dev creator not found");
const now = Math.floor(Date.now() / 1000);
const cookie = encodeSession({ uid: creator.id, addr: (creator.wallet_address ?? "0x0").toLowerCase(), iat: now, exp: now + 86400 });
console.log("minted session for", creator.id, "wallet", creator.wallet_address);

// give the demo account a handle so the "choose a username" modal doesn't
// blanket every studio page (no-op if already set / taken)
for (const u of ["devcreator", "dev_creator", "studio_dev"]) {
  const r = await fetch(`${BASE}/api/auth/username`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `findling_session=${cookie}` },
    body: JSON.stringify({ username: u }),
  });
  if (r.ok) { console.log("username set:", u); break; }
  if (r.status === 400) continue;
  const b = await r.json().catch(() => ({}));
  if (b.error !== "username_taken") { console.log("username:", r.status, JSON.stringify(b)); break; }
}

// ---- launch headless chromium ----
const profile = "/tmp/ux-profile";
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
  "--force-color-profile=srgb", "--disable-extensions", "about:blank",
], { stdio: "ignore" });

async function getJSON(path) {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`);
  return r.json();
}
async function waitPort() {
  for (let i = 0; i < 100; i++) {
    try { return await getJSON("/json/version"); } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  throw new Error("chromium devtools never came up");
}
const version = await waitPort();

// ---- minimal CDP client over the browser websocket (flat sessions) ----
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1;
const pending = new Map();
const waiters = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) {
      reject(new Error(JSON.stringify(msg.error)));
    } else {
      resolve(msg.result);
    }
  } else if (msg.method) {
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].method === msg.method && (!waiters[i].sessionId || waiters[i].sessionId === msg.sessionId)) {
        waiters[i].resolve(msg.params); waiters.splice(i, 1);
      }
    }
  }
};
function send(method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
function waitEvent(method, sessionId, timeout = 12000) {
  return new Promise((resolve) => {
    const w = { method, sessionId, resolve };
    waiters.push(w);
    setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); resolve(null); } }, timeout);
  });
}

// attach to a fresh page target
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = sessionId;
await send("Page.enable", {}, S);
await send("Network.enable", {}, S);
await send("Runtime.enable", {}, S);
await send("Network.setCookie", { name: "findling_session", value: cookie, url: BASE, path: "/", httpOnly: true, sameSite: "Lax" }, S);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function setSize(w, h) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 }, S);
}
async function nav(path, wait = 1600) {
  await send("Page.navigate", { url: BASE + path }, S);
  await waitEvent("Page.loadEventFired", S, 12000);
  await sleep(wait);
}
async function scrollTo(y) { await send("Runtime.evaluate", { expression: `scrollTo(0, ${y})` }, S); await sleep(900); }
async function shot(name, { full = false } = {}) {
  const res = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full, fromSurface: true }, S);
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.data, "base64"));
  console.log("  ✓", name);
}

const log = [];
try {
  // ===== desktop 1440x900 =====
  await setSize(1440, 900);
  await nav("/", 2200);
  await shot("01-landing-hero");
  await scrollTo(900 * 1.6); await shot("02-landing-mid");
  await scrollTo(900 * 3.4); await shot("03-landing-late");
  await scrollTo(99999); await sleep(700); await shot("03b-landing-footer");
  await nav("/studio", 1800); await shot("05-studio-home", { full: true });
  await nav("/studio/clips", 1800); await shot("06-studio-clips", { full: true });
  await nav("/studio/analytics", 1800); await shot("07-studio-analytics", { full: true });
  await nav("/studio/earnings", 1800); await shot("08-studio-earnings", { full: true });
  await nav("/studio/payouts", 1800); await shot("09-studio-payouts", { full: true });
  await nav("/studio/settings", 1800); await shot("10-studio-settings", { full: true });
  await nav("/studio/agents", 1800); await shot("10b-studio-agents", { full: true });
  if (run) { await nav(`/trace/${run.id}`, 2000); await shot("11-trace", { full: true }); }
  if (receipt) { await nav(`/r/${receipt.public_slug}`, 1800); await shot("12-receipt", { full: true }); }
  // ===== mobile 390x844 =====
  await setSize(390, 844);
  await nav("/", 2200); await shot("13-m-landing");
  await nav("/studio", 1800); await shot("15-m-studio-home", { full: true });
  await nav("/studio/settings", 1600); await shot("16-m-studio-settings", { full: true });
  log.push("all captured");
} catch (e) {
  log.push("ERROR " + (e?.message ?? e));
} finally {
  ws.close();
  chrome.kill("SIGTERM");
  console.log(log.join("; "));
  process.exit(0);
}

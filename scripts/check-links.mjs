/**
 * Dead-link audit: crawl every page (as the Dev Creator + logged-out), pull every
 * rendered href, and status-check each one against the running server. Reports any
 * internal link that 404s/500s and HEAD-checks external links too.
 *   node --env-file=.env.local scripts/check-links.mjs
 */
import { createHmac } from "node:crypto";
import postgres from "postgres";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://findling.timidan.xyz";
const secret = process.env.AUTH_SESSION_SECRET;
if (!secret) throw new Error("AUTH_SESSION_SECRET missing");

function encodeSession(p) {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const [creator] = await sql`select id, wallet_address from users where email='dev-creator@findling.local'`;
const [receipt] = await sql`select public_slug from receipts order by created_at desc limit 1`;
const [run] = await sql`select id from agent_runs where payment_status='settled' order by started_at desc limit 1`;
await sql.end();

const now = Math.floor(Date.now() / 1000);
const cookie =
  "findling_session=" +
  encodeSession({ uid: creator.id, addr: (creator.wallet_address ?? "0x0").toLowerCase(), iat: now, exp: now + 3600 });

// every page surface, crawled once authed and (for public ones) once logged-out
const authedPages = [
  "/", "/studio", "/studio/clips", "/studio/analytics", "/studio/earnings",
  "/studio/payouts", "/studio/settings", "/studio/upload", "/studio/agents", "/earnings",
  `/r/${receipt?.public_slug ?? "missing"}`, "/trace/latest",
  run ? `/trace/${run.id}` : null, "/skill.md",
].filter(Boolean);
const loggedOutPages = ["/", "/studio", "/earnings", `/r/${receipt?.public_slug ?? "missing"}`];

async function fetchHtml(path, authed) {
  const r = await fetch(BASE + path, { headers: authed ? { Cookie: cookie } : {} });
  return { status: r.status, html: await r.text().catch(() => "") };
}

function extractHrefs(html) {
  const out = new Set();
  for (const m of html.matchAll(/href=(?:"([^"]+)"|'([^']+)')/g)) {
    let h = (m[1] ?? m[2] ?? "").trim();
    if (!h || h.startsWith("#") || h.startsWith("mailto:") || h.startsWith("tel:")) continue;
    out.add(h.split("#")[0]);
  }
  return [...out].filter(Boolean);
}

// page -> fetch status; href -> Set(pages it appeared on)
const pageStatus = {};
const internal = new Map();
const external = new Map();

async function crawl(pages, authed, tag) {
  for (const p of pages) {
    const { status, html } = await fetchHtml(p, authed);
    pageStatus[`${p} (${tag})`] = status;
    for (const h of extractHrefs(html)) {
      const isExternal = /^https?:\/\//i.test(h);
      const bucket = isExternal ? external : internal;
      // normalize internal (must start with /)
      if (!isExternal && !h.startsWith("/")) continue;
      if (!bucket.has(h)) bucket.set(h, new Set());
      bucket.get(h).add(`${p}(${tag})`);
    }
  }
}

await crawl(authedPages, true, "auth");
await crawl(loggedOutPages, false, "out");

// status-check every unique internal link (authed, manual redirect)
const internalStatus = {};
for (const h of internal.keys()) {
  try {
    const r = await fetch(BASE + h, { headers: { Cookie: cookie }, redirect: "manual" });
    internalStatus[h] = r.status;
  } catch (e) {
    internalStatus[h] = "ERR:" + (e?.message ?? e);
  }
}

// HEAD-check external links (best-effort, 8s timeout)
const externalStatus = {};
for (const h of external.keys()) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let r = await fetch(h, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    if (r.status === 405 || r.status === 403) {
      // some hosts reject HEAD — retry GET
      r = await fetch(h, { method: "GET", redirect: "follow", signal: ctrl.signal });
    }
    clearTimeout(t);
    externalStatus[h] = r.status;
  } catch (e) {
    externalStatus[h] = "ERR:" + (e?.name ?? e);
  }
}

const ok = (s) => typeof s === "number" && s >= 200 && s < 400;

console.log("######## PAGE FETCH STATUS ########");
for (const [p, s] of Object.entries(pageStatus)) console.log(`  ${ok(s) ? "OK " : "BAD"} ${s}  ${p}`);

console.log("\n######## INTERNAL LINKS ########");
const deadInternal = [];
for (const [h, pgs] of [...internal.entries()].sort()) {
  const s = internalStatus[h];
  if (!ok(s)) deadInternal.push(`${h} (${s})`);
  console.log(`  ${ok(s) ? "OK " : "DEAD"} ${s}  ${h}   ⟵ ${[...pgs].join(", ")}`);
}

console.log("\n######## EXTERNAL LINKS ########");
const deadExternal = [];
for (const [h, pgs] of [...external.entries()].sort()) {
  const s = externalStatus[h];
  const bad = !ok(s) && !String(s).startsWith("ERR:AbortError");
  if (bad) deadExternal.push(`${h} (${s})`);
  console.log(`  ${ok(s) ? "OK " : "??? "} ${s}  ${h}   ⟵ ${[...pgs].join(", ")}`);
}

console.log("\n######## RESULT ########");
console.log(deadInternal.length ? `❌ DEAD INTERNAL LINKS:\n  - ${deadInternal.join("\n  - ")}` : "✅ no dead internal links");
console.log(deadExternal.length ? `⚠️  external links to review:\n  - ${deadExternal.join("\n  - ")}` : "✅ external links OK (or HEAD-blocked)");
process.exit(deadInternal.length ? 1 : 0);

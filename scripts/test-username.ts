/**
 * E2E proof of the username flow: SIWE login, then set/validate/uniqueness on
 * POST /api/auth/username.  npx tsx scripts/test-username.ts
 */
import { createSiweMessage } from "viem/siwe";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const BASE = process.env.BASE ?? "http://localhost:3000";
const HOST = new URL(BASE).host;

function jar() {
  const store: Record<string, string> = {};
  return {
    header: () => Object.entries(store).map(([k, v]) => `${k}=${v}`).join("; "),
    capture: (r: Response) => {
      for (const c of r.headers.getSetCookie?.() ?? []) {
        const kv = c.split(";")[0]; const i = kv.indexOf("=");
        if (i > 0) store[kv.slice(0, i)] = kv.slice(i + 1);
      }
    },
  };
}

async function login(c: ReturnType<typeof jar>) {
  const acct = privateKeyToAccount(generatePrivateKey());
  const nr = await fetch(`${BASE}/api/auth/nonce`); c.capture(nr);
  const { nonce } = await nr.json();
  const message = createSiweMessage({ address: acct.address, chainId: 1, domain: HOST, nonce, uri: BASE, version: "1", statement: "x" });
  const signature = await acct.signMessage({ message });
  const vr = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: c.header() }, body: JSON.stringify({ message, signature }) });
  c.capture(vr);
}

async function setUsername(c: ReturnType<typeof jar>, username: string) {
  const r = await fetch(`${BASE}/api/auth/username`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: c.header() }, body: JSON.stringify({ username }) });
  return { status: r.status, body: await r.json() };
}

async function main() {
  const a = jar(); await login(a);
  const name = "tester_" + Math.floor(performance.now()).toString(36);

  const me0 = await (await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: a.header() } })).json();
  const bad = await setUsername(a, "x");                 // too short
  const ok = await setUsername(a, name);                 // valid
  const me1 = await (await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: a.header() } })).json();

  const b = jar(); await login(b);
  const taken = await setUsername(b, name);              // someone else's

  console.log("initial username:", me0.user?.username);
  console.log("too short ->", bad.status, JSON.stringify(bad.body));
  console.log("valid set  ->", ok.status, JSON.stringify(ok.body));
  console.log("me.username ->", me1.user?.username);
  console.log("taken (other user) ->", taken.status, JSON.stringify(taken.body));

  const pass = me0.user?.username == null && bad.status === 400 && ok.status === 200 && me1.user?.username === name && taken.status === 409;
  console.log(pass ? "\n✅ username flow works (set, validate, unique)" : "\n❌ FAILED");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error("FAILED", e instanceof Error ? e.message : e); process.exit(1); });

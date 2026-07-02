/**
 * E2E proof of the payout-wallet setter: SIWE login, then set/validate/auth on
 * POST /api/auth/payout-wallet, confirmed via /api/auth/me.
 *   npx tsx --env-file=.env.local scripts/test-payout-wallet.ts
 */
import { createSiweMessage } from "viem/siwe";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const BASE = process.env.BASE ?? "https://findling.timidan.xyz";
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

async function setWallet(c: ReturnType<typeof jar>, address: string) {
  const r = await fetch(`${BASE}/api/auth/payout-wallet`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: c.header() }, body: JSON.stringify({ address }) });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function main() {
  const good = "0x" + "a1B2c3D4e5F6".padEnd(40, "0");
  const c = jar(); await login(c);

  const unauth = await (await fetch(`${BASE}/api/auth/payout-wallet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: good }) })).status;
  const bad = await setWallet(c, "0xnothex");
  const ok = await setWallet(c, good);
  const me = await (await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: c.header() } })).json();

  console.log("unauthenticated (want 401) ->", unauth);
  console.log("invalid address (want 400) ->", bad.status, JSON.stringify(bad.body));
  console.log("valid set (want 200)       ->", ok.status, JSON.stringify(ok.body));
  console.log("me.payoutWalletAddress     ->", me.user?.payoutWalletAddress);

  const pass = unauth === 401 && bad.status === 400 && ok.status === 200 &&
    (me.user?.payoutWalletAddress ?? "").toLowerCase() === good.toLowerCase();
  console.log(pass ? "\n✅ payout-wallet setter works (auth, validate, persist)" : "\n❌ FAILED");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error("FAILED", e instanceof Error ? e.message : e); process.exit(1); });

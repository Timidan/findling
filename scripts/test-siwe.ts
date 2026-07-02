/**
 * End-to-end proof of the wallet (SIWE) login: generate a throwaway wallet, run
 * nonce -> SIWE sign -> verify -> me against the live dev server, and confirm the
 * session maps to the signing address.
 *   npx tsx scripts/test-siwe.ts
 */
import { createSiweMessage } from "viem/siwe";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const BASE = process.env.BASE ?? "https://findling.timidan.xyz";
const HOST = new URL(BASE).host;

function jar() {
  const store: Record<string, string> = {};
  return {
    header: () =>
      Object.entries(store)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
    capture: (res: Response) => {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const kv = c.split(";")[0];
        const i = kv.indexOf("=");
        if (i > 0) store[kv.slice(0, i)] = kv.slice(i + 1);
      }
    },
  };
}

async function main() {
  const account = privateKeyToAccount(generatePrivateKey());
  const cookies = jar();
  console.log("wallet:", account.address);

  const nres = await fetch(`${BASE}/api/auth/nonce`);
  cookies.capture(nres);
  const { nonce } = (await nres.json()) as { nonce: string };
  console.log("nonce:", nonce);

  const message = createSiweMessage({
    address: account.address,
    chainId: 1,
    domain: HOST,
    nonce,
    uri: BASE,
    version: "1",
    statement: "Sign in to Findling",
  });
  const signature = await account.signMessage({ message });

  const vres = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies.header() },
    body: JSON.stringify({ message, signature }),
  });
  cookies.capture(vres);
  const verify = (await vres.json()) as Record<string, unknown>;
  console.log("verify:", vres.status, JSON.stringify(verify));

  const meres = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: cookies.header() },
  });
  const me = (await meres.json()) as { user?: { id?: string; address?: string } };
  console.log("me:", meres.status, JSON.stringify(me));

  // replay the SAME message+signature → must fail (single-use nonce)
  const replay = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies.header() },
    body: JSON.stringify({ message, signature }),
  });
  console.log("replay status (want 401):", replay.status);

  const ok =
    verify.ok === true &&
    String(verify.address).toLowerCase() === account.address.toLowerCase() &&
    me.user?.id === verify.userId &&
    replay.status === 401;
  console.log(ok ? "\n✅ SIWE login works end-to-end (+ replay blocked)" : "\n❌ FAILED");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("FAILED", e instanceof Error ? e.message : e);
  process.exit(1);
});

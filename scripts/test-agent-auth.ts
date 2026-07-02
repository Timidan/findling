/**
 * End-to-end proof of the AGENT plane: a wallet registers as an agent (SIWE) and
 * receives a bearer key, then uses that key to authenticate against the agent
 * surface (the withdraw route resolves the agent identity rather than 401).
 *   npx tsx scripts/test-agent-auth.ts
 */
import { createSiweMessage } from "viem/siwe";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const BASE = process.env.BASE ?? "https://findling.timidan.xyz";
const HOST = new URL(BASE).host;

function jar() {
  const store: Record<string, string> = {};
  return {
    header: () => Object.entries(store).map(([k, v]) => `${k}=${v}`).join("; "),
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
  console.log("agent wallet:", account.address);

  const nres = await fetch(`${BASE}/api/auth/nonce`);
  cookies.capture(nres);
  const { nonce } = (await nres.json()) as { nonce: string };

  const message = createSiweMessage({
    address: account.address,
    chainId: 1,
    domain: HOST,
    nonce,
    uri: BASE,
    version: "1",
    statement: "Onboard my agent to Findling",
  });
  const signature = await account.signMessage({ message });

  const rres = await fetch(`${BASE}/api/agent/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies.header() },
    body: JSON.stringify({ message, signature, label: "test-agent" }),
  });
  const reg = (await rres.json()) as { apiKey?: string; userId?: string };
  console.log("register:", rres.status, reg.apiKey ? `key=${reg.apiKey.slice(0, 16)}…` : JSON.stringify(reg));

  // Use the key on the authed surface. A valid key must NOT 401; a bad key MUST.
  const authed = await fetch(`${BASE}/api/earnings/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${reg.apiKey}` },
    body: JSON.stringify({ role: "finder" }),
  });
  const bad = await fetch(`${BASE}/api/earnings/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer fdl_agent_totally-invalid" },
    body: JSON.stringify({ role: "finder" }),
  });
  console.log("withdraw w/ valid key (want != 401):", authed.status);
  console.log("withdraw w/ bad key   (want 401):   ", bad.status);

  const ok = !!reg.apiKey && rres.status === 200 && authed.status !== 401 && bad.status === 401;
  console.log(ok ? "\n✅ Agent plane works (key issued + authenticates; bad key rejected)" : "\n❌ FAILED");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("FAILED", e instanceof Error ? e.message : e);
  process.exit(1);
});

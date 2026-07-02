/**
 * Proves the SELF-SERVE agent buy side end to end: an agent authenticates, then
 * CREATES its own buyer session grant via the API (no harness/script seeding),
 * lists it, uses it to license a real moment over x402, and revokes it. Also
 * checks the create-grant validation. Closes the "grants are script-only" gap.
 *   npx tsx --env-file=.env.local scripts/test-self-serve-grant.ts <momentId>
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import * as schema from "../src/server/db/schema";
import { issueAgentKey } from "../src/server/auth/agent-credential";
import { runAgentSearch, getAgentRun } from "../src/server/agent/agent";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://findling.timidan.xyz";
const BUYER_EMAIL = "loop-buyer@findling.test";

async function main() {
  const momentId = process.argv[2];
  if (!momentId) throw new Error("usage: test-self-serve-grant.ts <momentId>");
  const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  const AGENT_ADDR = process.env.AGENT_ADDRESS!;
  if (!AGENT_KEY || !AGENT_ADDR) throw new Error("AGENT_PRIVATE_KEY/ADDRESS not set");

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  // an agent with a bearer key (this is the only setup — the rest is via the API)
  let buyer = (await db.select().from(schema.users).where(eq(schema.users.email, BUYER_EMAIL)))[0];
  if (!buyer) {
    [buyer] = await db.insert(schema.users).values({ email: BUYER_EMAIL, displayName: "Loop Buyer", roles: ["buyer"] }).returning();
  }
  const apiKey = await issueAgentKey(buyer.id, "self-serve-test");
  const H = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  const moment = (await db.select().from(schema.moments).where(eq(schema.moments.id, momentId)))[0];
  if (!moment) throw new Error(`moment ${momentId} not found`);
  const price = moment.priceMicroUsdc;

  // 1) validation: each should be 400
  const bad = await Promise.all([
    fetch(`${BASE}/api/agent/session-grants`, { method: "POST", headers: H, body: JSON.stringify({ sessionKeyAddress: "0xnothex", totalCapMicroUsdc: price }) }),
    fetch(`${BASE}/api/agent/session-grants`, { method: "POST", headers: H, body: JSON.stringify({ sessionKeyAddress: AGENT_ADDR, totalCapMicroUsdc: -1 }) }),
    fetch(`${BASE}/api/agent/session-grants`, { method: "POST", headers: H, body: JSON.stringify({ sessionKeyAddress: AGENT_ADDR, totalCapMicroUsdc: price, perPurchaseCapMicroUsdc: price * 5 }) }),
    fetch(`${BASE}/api/agent/session-grants`, { method: "POST", headers: {}, body: JSON.stringify({ sessionKeyAddress: AGENT_ADDR, totalCapMicroUsdc: price }) }),
  ]);
  const validation = bad.map((r) => r.status);
  console.log("validation (want 400,400,400,401):", validation.join(","));

  // 2) CREATE a grant via the API (self-serve)
  const cr = await fetch(`${BASE}/api/agent/session-grants`, {
    method: "POST", headers: H,
    body: JSON.stringify({ sessionKeyAddress: AGENT_ADDR, totalCapMicroUsdc: price * 4, perPurchaseCapMicroUsdc: price, expiresInSeconds: 3600, allowedUsageTypes: ["video_embed"] }),
  });
  const crJson = await cr.json();
  console.log("create grant ->", cr.status, JSON.stringify(crJson.grant ?? crJson));
  const grant = crJson.grant;
  if (cr.status !== 201 || !grant?.id) throw new Error("grant creation failed");

  // 3) LIST shows it active
  const list = await (await fetch(`${BASE}/api/agent/session-grants`, { headers: H })).json();
  const listed = list.grants?.find((g: { id: string }) => g.id === grant.id);
  console.log("list shows grant active:", listed?.status === "active");

  // 4) USE the self-serve grant to license the moment over real x402
  const { agentRunId } = await runAgentSearch({
    requestText: moment.title, surface: "demo_harness",
    buyerId: buyer.id, sessionGrantId: grant.id, maxPriceMicroUsdc: price,
  });
  const gw = new GatewayClient({ chain: "arcTestnet", privateKey: AGENT_KEY });
  const bal = await gw.getBalances();
  if (Number(bal.gateway.available) < price) { console.log("depositing 0.5 USDC…"); await gw.deposit("0.5"); }
  const unlockUrl = `${BASE}/api/payments/x402/moments/${moment.id}/unlock?grantId=${grant.id}&agentRunId=${agentRunId}`;
  const pay = await gw.pay<{ receiptCode: string; paymentReference: string; split: Record<string, number> }>(unlockUrl);
  const run = await getAgentRun(agentRunId);
  const settled = run?.paymentStatus === "settled";
  console.log(`paid via self-serve grant -> receipt ${pay.data.receiptCode} · split ${JSON.stringify(pay.data.split)} · settled=${settled}`);

  // 5) REVOKE the grant
  const rev = await fetch(`${BASE}/api/agent/session-grants/${grant.id}`, { method: "DELETE", headers: H });
  const revJson = await rev.json();
  console.log("revoke ->", rev.status, "status:", revJson.grant?.status);

  await sql.end();
  const pass =
    validation.join(",") === "400,400,400,401" &&
    cr.status === 201 && listed?.status === "active" && settled &&
    rev.status === 200 && revJson.grant?.status === "revoked";
  console.log(pass ? "\n✅ SELF-SERVE grant onboarding works (create → list → pay → revoke)" : "\n❌ FAILED");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error("\nFAILED ❌", e instanceof Error ? e.message : e); process.exit(1); });

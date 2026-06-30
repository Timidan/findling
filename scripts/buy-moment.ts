/**
 * Autonomous buyer: license a specific moment with a REAL USDC nanopayment over
 * x402 on Arc testnet. Sets up a buyer session grant bound to the funded AGENT
 * key, records the agent run, funds Gateway if needed, pays the unlock route,
 * and verifies the settled purchase + 80/12/8 split.
 *   npx tsx --env-file=.env.local scripts/buy-moment.ts <momentId>
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import * as schema from "../src/server/db/schema";
import { runAgentSearch, getAgentRun } from "../src/server/agent/agent";

const BUYER_EMAIL = "loop-buyer@findling.test";

async function main() {
  const momentId = process.argv[2];
  if (!momentId) throw new Error("usage: buy-moment.ts <momentId>");
  const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  const AGENT_ADDR = process.env.AGENT_ADDRESS!;
  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!AGENT_KEY || !AGENT_ADDR) throw new Error("AGENT_PRIVATE_KEY/ADDRESS not set");

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  const moment = (await db.select().from(schema.moments).where(eq(schema.moments.id, momentId)))[0];
  if (!moment) throw new Error(`moment ${momentId} not found`);
  const price = moment.priceMicroUsdc;
  console.log(`buying "${moment.title}" — ${price} micro-USDC ($${moment.priceUsdSnapshot})`);

  // re-runnable buyer + a fresh grant each run. (We retire old active grants
  // instead of deleting them — they're FK-referenced by past runs/purchases.)
  let buyer = (await db.select().from(schema.users).where(eq(schema.users.email, BUYER_EMAIL)))[0];
  if (!buyer) {
    [buyer] = await db.insert(schema.users).values({ email: BUYER_EMAIL, displayName: "Loop Buyer", roles: ["buyer"] }).returning();
  } else {
    await db.update(schema.buyerSessionGrants).set({ status: "exhausted" }).where(eq(schema.buyerSessionGrants.buyerId, buyer.id));
  }
  // EXACT_CAP=1 sizes the grant to exactly one purchase, to prove the exact-cap
  // settlement path (reservation exhausts the grant, settlement still records).
  const cap = process.env.EXACT_CAP ? price : price * 10;
  const [grant] = await db.insert(schema.buyerSessionGrants).values({
    buyerId: buyer.id, walletAddress: AGENT_ADDR, sessionKeyAddress: AGENT_ADDR,
    totalCapMicroUsdc: cap, remainingCapMicroUsdc: cap, status: "active",
  }).returning();

  const { agentRunId } = await runAgentSearch({
    requestText: moment.title, surface: "demo_harness",
    buyerId: buyer.id, sessionGrantId: grant.id, maxPriceMicroUsdc: price,
  });

  const gw = new GatewayClient({ chain: "arcTestnet", privateKey: AGENT_KEY });
  const bal = await gw.getBalances();
  console.log(`gateway balance: ${bal.gateway.formattedAvailable} USDC`);
  if (Number(bal.gateway.available) < price) {
    console.log("depositing 0.5 USDC into Gateway…");
    await gw.deposit("0.5");
  }

  const unlockUrl = `${BASE}/api/payments/x402/moments/${moment.id}/unlock?grantId=${grant.id}&agentRunId=${agentRunId}`;
  console.log("paying the x402 unlock…");
  const pay = await gw.pay<{
    unlockUrl: string; receiptCode: string; paymentReference: string; payer: string;
    split: { creatorMicroUsdc: number; finderMicroUsdc: number; platformMicroUsdc: number };
  }>(unlockUrl);
  const d = pay.data;
  console.log(`✓ PAID ${pay.amount} USDC · ref ${d.paymentReference}`);
  console.log(`✓ receipt ${d.receiptCode} · split ${JSON.stringify(d.split)}`);

  const purchase = (await db.select().from(schema.purchases).where(eq(schema.purchases.paymentReference, d.paymentReference)))[0];
  const run = await getAgentRun(agentRunId);
  const ok = !!purchase && purchase.status === "settled" && purchase.provider === "gateway_x402" && run?.paymentStatus === "settled";
  console.log(ok ? `\n✅ REAL Arc x402 purchase settled (run ${agentRunId})` : "\n❌ settlement not verified");

  await sql.end();
  console.log(JSON.stringify({ momentId, receiptCode: d.receiptCode, paymentReference: d.paymentReference, split: d.split, agentRunId }));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error("\nBUY FAILED ❌", e instanceof Error ? e.message : e); process.exit(1); });

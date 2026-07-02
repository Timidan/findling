/**
 * LIVE Arc-testnet proof: a consumer agent autonomously licenses a moment with
 * a real USDC nanopayment over x402, and the 80/12/8 split is recorded.
 *
 *   set up a buyer grant + finder curation + agent run → agent deposits into
 *   Gateway → agent GatewayClient.pay(unlockUrl) → seller verifies+settles
 *   on-chain → purchase + receipt + grant decrement + finder 12% + trace.
 *
 * Requires the Next dev server running (the x402 unlock route must be reachable)
 * and SELLER/AGENT wallets funded with Arc testnet USDC.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import * as schema from "../src/server/db/schema";
import { submitCuration } from "../src/server/catalog/curation";
import { runAgentSearch, getAgentRun } from "../src/server/agent/agent";
import { getEarnings } from "../src/server/ledger/earnings";

const FINDER_EMAIL = "arc-finder@findling.test";
const BUYER_EMAIL = "arc-buyer@findling.test";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  const AGENT_ADDR = process.env.AGENT_ADDRESS!;
  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://findling.timidan.xyz";
  if (!AGENT_KEY || !AGENT_ADDR) throw new Error("AGENT_PRIVATE_KEY/ADDRESS not set");

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  // ---- clean prior test identities (re-runnable) ----
  const old = await db
    .select()
    .from(schema.users)
    .where(inArray(schema.users.email, [FINDER_EMAIL, BUYER_EMAIL]));
  if (old.length) {
    const ids = old.map((u) => u.id);
    // order matters: purchases/runs reference grants; runs reference grants too
    const pr = await db
      .select({ id: schema.purchases.id })
      .from(schema.purchases)
      .where(inArray(schema.purchases.buyerId, ids));
    const prIds = pr.map((p) => p.id);
    if (prIds.length) {
      await db.delete(schema.receipts).where(inArray(schema.receipts.purchaseId, prIds));
      await db.delete(schema.purchases).where(inArray(schema.purchases.id, prIds));
    }
    await db.delete(schema.agentRuns).where(inArray(schema.agentRuns.buyerId, ids));
    await db.delete(schema.curations).where(inArray(schema.curations.finderId, ids));
    await db.delete(schema.buyerSessionGrants).where(inArray(schema.buyerSessionGrants.buyerId, ids));
    await db.delete(schema.users).where(inArray(schema.users.id, ids));
  }

  const moment = (await db.select().from(schema.moments).limit(1))[0];
  if (!moment) throw new Error("no moment");
  const price = moment.priceMicroUsdc;
  console.log(`moment "${moment.title}" — price ${price} micro-USDC ($${moment.priceUsdSnapshot})\n`);

  // ---- DB setup: finder + curation, buyer + grant bound to the AGENT key ----
  const [finder] = await db
    .insert(schema.users)
    .values({ email: FINDER_EMAIL, displayName: "Arc Finder", roles: ["finder"], payoutWalletAddress: process.env.CREATOR_PAYOUT_ADDRESS })
    .returning();
  const [buyer] = await db
    .insert(schema.users)
    .values({ email: BUYER_EMAIL, displayName: "Arc Buyer", roles: ["buyer"], walletAddress: AGENT_ADDR })
    .returning();
  // curation must predate the run for attribution
  await submitCuration({ momentId: moment.id, finderId: finder.id, tags: ["arc", "live"], relevanceText: "live demo curation" });
  const [grant] = await db
    .insert(schema.buyerSessionGrants)
    .values({
      buyerId: buyer.id,
      walletAddress: AGENT_ADDR,
      sessionKeyAddress: AGENT_ADDR, // the agent's funded EOA IS the session key
      totalCapMicroUsdc: price * 10,
      remainingCapMicroUsdc: price * 10,
      status: "active",
    })
    .returning();
  const { agentRunId } = await runAgentSearch({
    requestText: "the opening moment",
    surface: "demo_harness",
    buyerId: buyer.id,
    sessionGrantId: grant.id,
    maxPriceMicroUsdc: price,
  });
  console.log(`setup: finder ${finder.id.slice(0, 8)} · buyer ${buyer.id.slice(0, 8)} · grant ${grant.id.slice(0, 8)} · run ${agentRunId.slice(0, 8)}\n`);

  // ---- agent funds its Gateway balance if needed ----
  const gw = new GatewayClient({ chain: "arcTestnet", privateKey: AGENT_KEY });
  const balances = await gw.getBalances();
  console.log(`[1] agent gateway balance: ${balances.gateway.formattedAvailable} USDC (wallet ${balances.wallet.formatted})`);
  if (Number(balances.gateway.available) < price) {
    console.log("  · depositing 0.5 USDC into Gateway (approve + deposit)…");
    const dep = await gw.deposit("0.5");
    console.log(`  ✓ deposited: ${dep.depositTxHash}`);
  } else {
    console.log("  · sufficient gateway balance, skipping deposit");
  }

  // ---- the autonomous payment ----
  const unlockUrl = `${BASE}/api/payments/x402/moments/${moment.id}/unlock?grantId=${grant.id}&agentRunId=${agentRunId}`;
  console.log(`\n[2] agent pays the x402 unlock route…`);
  const pay = await gw.pay<{
    unlockUrl: string;
    receiptCode: string;
    paymentReference: string;
    payer: string;
    split: { creatorMicroUsdc: number; finderMicroUsdc: number; platformMicroUsdc: number };
  }>(unlockUrl);
  const data = pay.data;
  console.log(`  ✓ PAID ${pay.amount} USDC · tx ${data.paymentReference}`);
  console.log(`  ✓ receipt ${data.receiptCode} · split`, JSON.stringify(data.split));
  assert(!!data.unlockUrl, "got a signed unlock URL back");
  assert(data.payer.toLowerCase() === AGENT_ADDR.toLowerCase(), "payer == agent session key");

  // ---- verify on-chain settlement landed in the ledger ----
  console.log(`\n[3] verify ledger:`);
  const purchase = (
    await db.select().from(schema.purchases).where(eq(schema.purchases.paymentReference, data.paymentReference))
  )[0];
  assert(!!purchase && purchase.status === "settled", "purchase row settled");
  assert(purchase.provider === "gateway_x402", "provider = gateway_x402 (REAL Arc)");
  assert(
    purchase.creatorMicroUsdc + purchase.finderMicroUsdc + purchase.platformMicroUsdc === price,
    "split sums to gross",
  );
  const freshGrant = (
    await db.select().from(schema.buyerSessionGrants).where(eq(schema.buyerSessionGrants.id, grant.id))
  )[0];
  assert(freshGrant.remainingCapMicroUsdc === price * 10 - price, "grant cap decremented by price");

  const run = await getAgentRun(agentRunId);
  assert(run?.paymentStatus === "settled" && run?.purchaseId === purchase.id, "agent_run trace closed (chosen + purchase linked)");

  const finderEarn = await getEarnings(finder.id);
  assert(finderEarn.finder.accruedMicroUsdc === Math.floor((price * 1200) / 10000), "finder earned 12% on a REAL payment");

  console.log(`\n[4] seller Gateway balance (best-effort; RPC can be slow):`);
  try {
    const sellerGw = new GatewayClient({ chain: "arcTestnet", privateKey: process.env.SELLER_PRIVATE_KEY as `0x${string}` });
    const sellerBal = await Promise.race([
      sellerGw.getBalances(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("rpc_timeout")), 8000)),
    ]);
    console.log(`  seller gateway available: ${(sellerBal as Awaited<ReturnType<typeof sellerGw.getBalances>>).gateway.formattedAvailable} USDC`);
  } catch (e) {
    console.log(`  (skipped balance read: ${e instanceof Error ? e.message : e})`);
  }

  await sql.end();
  console.log(`\n🎉 LIVE ARC PAYMENT OK ✅  real USDC nanopayment verified + settled via Circle Gateway on Arc testnet (eip155:5042002)`);
  console.log(`   Circle settlement ref: ${data.paymentReference} (batched; on-chain when Circle flushes the batch)`);
}

main().catch((e) => {
  console.error("\nLIVE ARC FAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

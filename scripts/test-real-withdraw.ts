/**
 * Prove a REAL on-chain payout: with PAYMENT_PROVIDER=gateway_x402, the agent
 * finder withdraws its accrued 12% to its registered payout wallet, settling on
 * Arc via the seller's Gateway balance.
 *   npx tsx --env-file=.env.local scripts/test-real-withdraw.ts
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import * as schema from "../src/server/db/schema";
import { issueAgentKey } from "../src/server/auth/agent-credential";
import { getEarnings } from "../src/server/ledger/earnings";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const FINDER_EMAIL = "loop-finder@findling.test";

async function main() {
  const sellerKey = process.env.SELLER_PRIVATE_KEY as `0x${string}`;
  if (!sellerKey) throw new Error("SELLER_PRIVATE_KEY not set");
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  const gw = new GatewayClient({ chain: "arcTestnet", privateKey: sellerKey });
  const bal = await gw.getBalances();
  console.log(`seller gateway available: ${bal.gateway.formattedAvailable} USDC`);

  const finder = (await db.select().from(schema.users).where(eq(schema.users.email, FINDER_EMAIL)))[0];
  if (!finder) throw new Error("loop-finder not found");
  if (!finder.payoutWalletAddress) throw new Error("loop-finder has no registered payout wallet");
  const earn = await getEarnings(finder.id);
  const withdrawable = earn.finder.withdrawableMicroUsdc;
  console.log(
    `finder withdrawable: ${(withdrawable / 1e6).toFixed(3)} USDC → ${finder.payoutWalletAddress}`,
  );
  if (withdrawable <= 0) {
    console.log("nothing to withdraw (already paid out) — accruing a balance requires a finder-attributed sale");
    await sql.end();
    process.exit(0);
  }
  if (Number(bal.gateway.available) < withdrawable) {
    console.log("⚠️ seller gateway balance < withdrawable — fund the seller before payout");
  }

  const apiKey = await issueAgentKey(finder.id, "withdraw-proof");
  const res = await fetch(`${BASE}/api/earnings/withdraw`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "finder" }),
  });
  const out = await res.json().catch(() => null);
  console.log("withdraw ->", res.status, JSON.stringify(out));
  await sql.end();

  const ok = res.status === 200 && out?.status === "succeeded" && !!out?.transactionHash;
  console.log(
    ok
      ? `\n✅ REAL on-chain payout: ${(out.amountMicroUsdc / 1e6).toFixed(3)} USDC → ${out.recipient}\n   tx ${out.transactionHash}`
      : `\n❌ payout not confirmed (status=${out?.status}, reason=${out?.failureReason ?? out?.error})`,
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error("FAILED", e instanceof Error ? e.message : e); process.exit(1); });

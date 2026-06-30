/**
 * Populate the demo creator's Transactions feed with a REAL on-chain payout:
 * Dev Creator withdraws its accrued 80% creator balance to its registered payout
 * wallet, settling on Arc via the seller's Gateway balance.
 *
 * Inspect first (read-only):
 *   npx tsx --env-file=.env.local scripts/withdraw-creator.ts
 * Then execute the on-chain withdrawal:
 *   EXECUTE=1 npx tsx --env-file=.env.local scripts/withdraw-creator.ts
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import * as schema from "../src/server/db/schema";
import { issueAgentKey } from "../src/server/auth/agent-credential";
import { getEarnings } from "../src/server/ledger/earnings";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const CREATOR_EMAIL = "dev-creator@findling.local";

async function main() {
  const sellerKey = process.env.SELLER_PRIVATE_KEY as `0x${string}`;
  if (!sellerKey) throw new Error("SELLER_PRIVATE_KEY not set");
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  const gw = new GatewayClient({ chain: "arcTestnet", privateKey: sellerKey });
  const bal = await gw.getBalances();
  console.log(`seller gateway available: ${bal.gateway.formattedAvailable} USDC`);

  const creator = (
    await db.select().from(schema.users).where(eq(schema.users.email, CREATOR_EMAIL))
  )[0];
  if (!creator) throw new Error(`${CREATOR_EMAIL} not found`);
  console.log(`creator: ${creator.id}`);
  console.log(`payout wallet: ${creator.payoutWalletAddress ?? "(none set)"}`);
  if (!creator.payoutWalletAddress) {
    console.log("⚠️ no payout wallet — set one in Settings before withdrawing.");
    await sql.end();
    process.exit(1);
  }

  const earn = await getEarnings(creator.id);
  const withdrawable = earn.creator.withdrawableMicroUsdc;
  console.log(
    `creator withdrawable: ${(withdrawable / 1e6).toFixed(3)} USDC → ${creator.payoutWalletAddress}`,
  );
  console.log(
    `  (accrued ${(earn.creator.accruedMicroUsdc / 1e6).toFixed(3)}, withdrawn ${(earn.creator.withdrawnMicroUsdc / 1e6).toFixed(3)})`,
  );
  if (withdrawable <= 0) {
    console.log("nothing to withdraw.");
    await sql.end();
    process.exit(0);
  }
  if (Number(bal.gateway.available) < withdrawable) {
    console.log("⚠️ seller gateway balance < withdrawable — fund the seller first.");
  }

  if (process.env.EXECUTE !== "1") {
    console.log("\n(dry run) re-run with EXECUTE=1 to settle this on-chain.");
    await sql.end();
    process.exit(0);
  }

  const apiKey = await issueAgentKey(creator.id, "creator-withdraw-proof");
  const res = await fetch(`${BASE}/api/earnings/withdraw`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "creator" }),
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

main().catch((e) => {
  console.error("FAILED", e instanceof Error ? e.message : e);
  process.exit(1);
});

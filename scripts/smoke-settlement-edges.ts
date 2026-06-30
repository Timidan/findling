/**
 * Live proof of the settlement guardrails Codex flagged (NOW#1 + NOW#2):
 *   - session-grant cap decremented EXACTLY ONCE, atomic with the purchase
 *   - over-remaining-cap, over-per-purchase-cap, payer!=session-key all rejected
 *     WITHOUT touching the cap
 *   - duplicate retry returns the same purchase (reused), no double-decrement
 *   - grant exhaustion flips status; further settles refused
 *   - concurrent same-key settlements (no grant) → one row, both see it (23505
 *     recovery path)
 * Creates a throwaway grant + purchases, asserts, then cleans everything up.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like, sql as dsql } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import {
  recordSettlement,
  SettlementError,
  type SettlementErrorReason,
} from "../src/server/ledger/settlement";

const SESSION_KEY = "0xSESSIONKEY";
const WRONG_KEY = "0xWRONGKEY";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function expectReason(
  fn: () => Promise<unknown>,
  reason: SettlementErrorReason,
) {
  try {
    await fn();
    throw new Error(`expected SettlementError(${reason}) but it resolved`);
  } catch (e) {
    if (e instanceof SettlementError && e.reason === reason) {
      console.log(`  ✓ rejected with ${reason}`);
      return;
    }
    throw e;
  }
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  const moment = (await db.select().from(schema.moments).limit(1))[0];
  if (!moment) throw new Error("no moment to settle against");
  const buyerId = process.env.DEV_USER_ID!;
  const createdPurchaseIds: string[] = [];

  // pre-clean: make this script re-runnable after a mid-run failure
  const leftover = await db
    .select({ id: schema.purchases.id })
    .from(schema.purchases)
    .where(like(schema.purchases.idempotencyKey, "edge-%"));
  if (leftover.length) {
    const ids = leftover.map((r) => r.id);
    await db.delete(schema.receipts).where(inArray(schema.receipts.purchaseId, ids));
    await db.delete(schema.purchases).where(inArray(schema.purchases.id, ids));
  }
  await db
    .delete(schema.buyerSessionGrants)
    .where(dsql`${schema.buyerSessionGrants.sessionKeyAddress} = ${SESSION_KEY}`);

  // throwaway grant: total 70k, remaining 70k, perPurchaseCap 60k
  const [grant] = await db
    .insert(schema.buyerSessionGrants)
    .values({
      buyerId,
      walletAddress: "0xBUYERWALLET",
      sessionKeyAddress: SESSION_KEY,
      totalCapMicroUsdc: 70_000,
      remainingCapMicroUsdc: 70_000,
      perPurchaseCapMicroUsdc: 60_000,
      status: "active",
    })
    .returning();
  console.log(`grant ${grant.id} created (remaining 70000)`);

  const base = {
    momentId: moment.id,
    buyerId,
    sessionGrantId: grant.id,
    provider: "mock" as const,
    network: "arcTestnet",
    sellerAddress: "0xSELLER",
    payerAddress: SESSION_KEY,
  };

  const remainingNow = async () =>
    (
      await db
        .select()
        .from(schema.buyerSessionGrants)
        .where(eq(schema.buyerSessionGrants.id, grant.id))
    )[0].remainingCapMicroUsdc;
  const statusNow = async () =>
    (
      await db
        .select()
        .from(schema.buyerSessionGrants)
        .where(eq(schema.buyerSessionGrants.id, grant.id))
    )[0].status;

  console.log("\n[A] first settlement, gross 50000:");
  const a = await recordSettlement({
    ...base,
    grossMicroUsdc: 50_000,
    paymentReference: "ref-A",
    idempotencyKey: "edge-A",
  });
  createdPurchaseIds.push(a.purchase.id);
  assert(!a.reused, "A is a fresh settlement");
  assert(
    a.purchase.creatorMicroUsdc + a.purchase.finderMicroUsdc + a.purchase.platformMicroUsdc ===
      50_000,
    "A split sums to gross",
  );
  assert((await remainingNow()) === 20_000, "cap decremented 70000 -> 20000");

  console.log("\n[retry A] same key:");
  const aRetry = await recordSettlement({
    ...base,
    grossMicroUsdc: 50_000,
    paymentReference: "ref-A",
    idempotencyKey: "edge-A",
  });
  assert(aRetry.reused, "retry A reused");
  assert(aRetry.purchase.id === a.purchase.id, "retry A same purchase id");
  assert((await remainingNow()) === 20_000, "no double-decrement (still 20000)");

  console.log("\n[B] over-remaining-cap, gross 50000 > remaining 20000:");
  await expectReason(
    () =>
      recordSettlement({
        ...base,
        grossMicroUsdc: 50_000,
        paymentReference: "ref-B",
        idempotencyKey: "edge-B",
      }),
    "over_remaining_cap",
  );
  assert((await remainingNow()) === 20_000, "cap untouched after over-remaining reject");

  console.log("\n[C] over-per-purchase-cap, gross 65000 > perPurchase 60000:");
  await expectReason(
    () =>
      recordSettlement({
        ...base,
        grossMicroUsdc: 65_000,
        paymentReference: "ref-C",
        idempotencyKey: "edge-C",
      }),
    "over_per_purchase_cap",
  );
  assert((await remainingNow()) === 20_000, "cap untouched after over-per-purchase reject");

  console.log("\n[D] payer != session key:");
  await expectReason(
    () =>
      recordSettlement({
        ...base,
        payerAddress: WRONG_KEY,
        grossMicroUsdc: 10_000,
        paymentReference: "ref-D",
        idempotencyKey: "edge-D",
      }),
    "payer_not_session_key",
  );
  assert((await remainingNow()) === 20_000, "cap untouched after payer-mismatch reject");

  console.log("\n[E] exhaust the grant, gross 20000 -> remaining 0:");
  const e = await recordSettlement({
    ...base,
    grossMicroUsdc: 20_000,
    paymentReference: "ref-E",
    idempotencyKey: "edge-E",
  });
  createdPurchaseIds.push(e.purchase.id);
  assert((await remainingNow()) === 0, "cap decremented to 0");
  assert((await statusNow()) === "exhausted", "grant status flipped to exhausted");

  console.log("\n[F] settle against exhausted grant -> refused:");
  await expectReason(
    () =>
      recordSettlement({
        ...base,
        grossMicroUsdc: 1,
        paymentReference: "ref-F",
        idempotencyKey: "edge-F",
      }),
    "grant_not_active",
  );

  console.log("\n[G] concurrent same-key settlements (no grant) -> 23505 recovery:");
  const concurrent = await Promise.all([
    recordSettlement({
      momentId: moment.id,
      buyerId,
      grossMicroUsdc: 30_000,
      provider: "mock",
      network: "arcTestnet",
      sellerAddress: "0xSELLER",
      payerAddress: "0xANY",
      paymentReference: "ref-G",
      idempotencyKey: "edge-G",
    }),
    recordSettlement({
      momentId: moment.id,
      buyerId,
      grossMicroUsdc: 30_000,
      provider: "mock",
      network: "arcTestnet",
      sellerAddress: "0xSELLER",
      payerAddress: "0xANY",
      paymentReference: "ref-G",
      idempotencyKey: "edge-G",
    }),
  ]);
  createdPurchaseIds.push(concurrent[0].purchase.id);
  assert(
    concurrent[0].purchase.id === concurrent[1].purchase.id,
    "both concurrent calls resolved to the SAME purchase id",
  );
  const gRows = await db
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.idempotencyKey, "edge-G"));
  assert(gRows.length === 1, "exactly one purchase row exists for the raced key");

  // cleanup
  console.log("\ncleaning up...");
  const ids = Array.from(new Set(createdPurchaseIds));
  await db.delete(schema.receipts).where(inArray(schema.receipts.purchaseId, ids));
  await db.delete(schema.purchases).where(inArray(schema.purchases.id, ids));
  await db
    .delete(schema.buyerSessionGrants)
    .where(eq(schema.buyerSessionGrants.id, grant.id));
  console.log(`  ✓ removed ${ids.length} purchases + receipts + the grant`);

  await sql.end();
  console.log("\nSETTLEMENT GUARDRAILS OK ✅  (cap exactly-once · rejections · idempotency · 23505 recovery)");
}

main().catch((e) => {
  console.error("\nSETTLEMENT EDGES FAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

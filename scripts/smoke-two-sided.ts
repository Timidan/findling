/**
 * Live proof of the TWO-SIDED agent economy (mock rail, no Arc funds):
 *   an agent FINDER curates a moment → an agent BUYER purchases it →
 *   the finder earns the 12% split → getEarnings reflects a withdrawable balance.
 * Creates throwaway finder/buyer/grant/curation/purchase rows, asserts, cleans up.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import { submitCuration } from "../src/server/catalog/curation";
import { getEarnings } from "../src/server/ledger/earnings";
import { recordSettlement } from "../src/server/ledger/settlement";

const FINDER_EMAIL = "agent-finder@findling.test";
const BUYER_EMAIL = "agent-buyer@findling.test";
const SESSION_KEY = "0xAGENTBUYERSESSIONKEY";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  // pre-clean (re-runnable)
  const oldUsers = await db
    .select()
    .from(schema.users)
    .where(inArray(schema.users.email, [FINDER_EMAIL, BUYER_EMAIL]));
  if (oldUsers.length) {
    const ids = oldUsers.map((u) => u.id);
    const ps = await db
      .select({ id: schema.purchases.id })
      .from(schema.purchases)
      .where(inArray(schema.purchases.buyerId, ids));
    const pids = ps.map((p) => p.id);
    if (pids.length) {
      await db.delete(schema.receipts).where(inArray(schema.receipts.purchaseId, pids));
      await db.delete(schema.purchases).where(inArray(schema.purchases.id, pids));
    }
    await db.delete(schema.curations).where(inArray(schema.curations.finderId, ids));
    await db.delete(schema.buyerSessionGrants).where(inArray(schema.buyerSessionGrants.buyerId, ids));
    await db.delete(schema.users).where(inArray(schema.users.id, ids));
  }

  const moment = (await db.select().from(schema.moments).limit(1))[0];
  if (!moment) throw new Error("no moment");
  const gross = moment.priceMicroUsdc;
  console.log(`moment "${moment.title}" priced ${gross} micro-USDC\n`);

  // agent finder + agent buyer identities (each with its own payout wallet)
  const [finder] = await db
    .insert(schema.users)
    .values({ email: FINDER_EMAIL, displayName: "Curator Agent", roles: ["finder"], payoutWalletAddress: "0xFINDERPAYOUT" })
    .returning();
  const [buyer] = await db
    .insert(schema.users)
    .values({ email: BUYER_EMAIL, displayName: "Buyer Agent", roles: ["buyer"] })
    .returning();
  const [grant] = await db
    .insert(schema.buyerSessionGrants)
    .values({
      buyerId: buyer.id,
      walletAddress: "0xBUYERWALLET",
      sessionKeyAddress: SESSION_KEY,
      totalCapMicroUsdc: gross * 4,
      remainingCapMicroUsdc: gross * 4,
      status: "active",
    })
    .returning();

  console.log("[1] agent finder curates the moment:");
  const curation = await submitCuration({
    momentId: moment.id,
    finderId: finder.id,
    tags: ["demo", "anime", "opening"],
    relevanceText: "great cold-open energy for a weeknight edit",
  });
  assert(!!curation.id, "curation created");

  console.log("\n[2] finder earnings are zero before any sale:");
  const before = await getEarnings(finder.id);
  assert(before.finder.accruedMicroUsdc === 0, "finder accrued = 0 pre-sale");

  console.log("\n[3] agent buyer purchases, attributing the finder's curation:");
  const settled = await recordSettlement({
    momentId: moment.id,
    buyerId: buyer.id,
    grossMicroUsdc: gross,
    finderId: finder.id,
    curationId: curation.id,
    attributionReason: "earliest_curation_before_run",
    sessionGrantId: grant.id,
    provider: "mock",
    paymentReference: "two-sided-ref",
    network: "arcTestnet",
    sellerAddress: "0xSELLER",
    payerAddress: SESSION_KEY,
    idempotencyKey: "two-sided-idem",
  });
  const expectedFinder = Math.floor((gross * 1200) / 10000);
  assert(settled.purchase.finderMicroUsdc === expectedFinder, `purchase credits finder ${expectedFinder} (12%)`);

  console.log("\n[4] finder now has a withdrawable 12% balance:");
  const after = await getEarnings(finder.id);
  console.log("  finder earnings:", JSON.stringify(after.finder));
  assert(after.finder.accruedMicroUsdc === expectedFinder, `finder accrued = ${expectedFinder}`);
  assert(after.finder.withdrawableMicroUsdc === expectedFinder, "finder withdrawable = accrued (nothing withdrawn yet)");

  console.log("\n[5] the creator earned the 80% on the same sale:");
  const creatorEarnings = await getEarnings(moment.creatorId);
  const expectedCreator = gross - expectedFinder - Math.floor((gross * 800) / 10000);
  console.log("  creator earnings (this user, all sales):", JSON.stringify(creatorEarnings.creator));
  assert(creatorEarnings.creator.accruedMicroUsdc >= expectedCreator, `creator accrued >= ${expectedCreator} from this sale`);

  // cleanup
  console.log("\ncleaning up...");
  await db.delete(schema.receipts).where(eq(schema.receipts.purchaseId, settled.purchase.id));
  await db.delete(schema.purchases).where(eq(schema.purchases.id, settled.purchase.id));
  await db.delete(schema.curations).where(eq(schema.curations.id, curation.id));
  await db.delete(schema.buyerSessionGrants).where(eq(schema.buyerSessionGrants.id, grant.id));
  await db.delete(schema.users).where(inArray(schema.users.id, [finder.id, buyer.id]));
  console.log("  ✓ removed finder/buyer/grant/curation/purchase");

  await sql.end();
  console.log("\nTWO-SIDED AGENT ECONOMY OK ✅  (agent curates → agent buys → finder earns 12% → withdrawable)");
}

main().catch((e) => {
  console.error("\nTWO-SIDED FAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

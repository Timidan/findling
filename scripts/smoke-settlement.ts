/**
 * Live proof of the money path: MockPaymentProvider.settle -> recordSettlement
 * -> purchase + receipt rows on the real DB, split sums to gross, idempotent
 * re-settle returns the SAME purchase. Cleans up the rows it creates.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import { MockPaymentProvider } from "../src/server/payment/mock-provider";
import { recordSettlement } from "../src/server/ledger/settlement";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  const moment = (
    await db.select().from(schema.moments).limit(1)
  )[0];
  if (!moment) throw new Error("no moment to settle against");
  const buyerId = process.env.DEV_USER_ID!;
  const gross = moment.priceMicroUsdc;
  const idem = `smoke-settle-${moment.id}`;

  const provider = new MockPaymentProvider();
  const requirement = provider.buildRequirement({
    amountMicroUsdc: gross,
    sellerAddress: "0xSELLER_SMOKE",
    network: "arcTestnet",
    resource: moment.id,
    idempotencyKey: idem,
  });
  const settlement = await provider.settle(
    { mock: true, payerAddress: "0xBUYER_SMOKE", amountMicroUsdc: gross },
    requirement,
  );
  if (!settlement.ok) throw new Error(`settle failed: ${settlement.reason}`);
  console.log(`✓ provider settled: ref=${settlement.paymentReference} payer=${settlement.payerAddress}`);

  const first = await recordSettlement({
    momentId: moment.id,
    buyerId,
    grossMicroUsdc: gross,
    provider: provider.name,
    paymentReference: settlement.paymentReference!,
    network: settlement.network,
    sellerAddress: requirement.sellerAddress,
    payerAddress: settlement.payerAddress,
    idempotencyKey: idem,
  });

  const { purchase, receipt } = first;
  if (!receipt) throw new Error("expected a receipt on first settlement");
  const splitSum =
    purchase.creatorMicroUsdc + purchase.finderMicroUsdc + purchase.platformMicroUsdc;
  console.log("✓ purchase:", {
    gross: purchase.grossMicroUsdc,
    creator: purchase.creatorMicroUsdc,
    finder: purchase.finderMicroUsdc,
    platform: purchase.platformMicroUsdc,
    status: purchase.status,
    payer: purchase.payerAddress,
  });
  if (splitSum !== purchase.grossMicroUsdc)
    throw new Error(`split ${splitSum} != gross ${purchase.grossMicroUsdc}`);
  console.log(`✓ split sums to gross (${splitSum} == ${purchase.grossMicroUsdc})`);
  console.log("✓ receipt:", {
    code: receipt.receiptCode,
    slug: receipt.publicSlug,
    sourceType: receipt.sourceType,
    ownershipModel: receipt.ownershipModel,
    attestationVersion: receipt.attestationVersion,
    momentTitle: receipt.momentTitle,
  });

  // idempotency: same key must return the same purchase, no new rows
  const second = await recordSettlement({
    momentId: moment.id,
    buyerId,
    grossMicroUsdc: gross,
    provider: provider.name,
    paymentReference: settlement.paymentReference!,
    network: settlement.network,
    sellerAddress: requirement.sellerAddress,
    payerAddress: settlement.payerAddress,
    idempotencyKey: idem,
  });
  if (!second.reused || second.purchase.id !== purchase.id)
    throw new Error("idempotency broken: re-settle did not reuse the purchase");
  console.log(`✓ idempotent re-settle reused purchase ${purchase.id} (reused=${second.reused})`);

  // cleanup
  await db.delete(schema.receipts).where(eq(schema.receipts.purchaseId, purchase.id));
  await db.delete(schema.purchases).where(eq(schema.purchases.id, purchase.id));
  const left = await db
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.id, purchase.id));
  console.log(`✓ cleaned up test rows (${left.length} purchase rows remain)`);

  await sql.end();
  console.log("\nSETTLEMENT MONEY PATH OK ✅  (split → purchase → receipt → idempotency)");
}

main().catch((e) => {
  console.error("\nSETTLEMENT FAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

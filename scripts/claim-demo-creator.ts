/**
 * Move the seeded Dev Creator's demo data (assets, moments, clip jobs, and the
 * settled-purchase creator earnings) to the wallet a tester is actually signed
 * in with — so the populated studio shows up for their connected account
 * without breaking their session. DEMO ONLY.
 *   npx tsx --env-file=.env.local scripts/claim-demo-creator.ts 0x<address>
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema";

const DEV_CREATOR_EMAIL = "dev-creator@findling.local";

async function main() {
  const target = (process.argv[2] ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(target)) {
    console.error("usage: claim-demo-creator.ts 0x<address>");
    process.exit(1);
  }
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  const dev = (await db.select().from(schema.users).where(eq(schema.users.email, DEV_CREATOR_EMAIL)))[0];
  const me = (await db.select().from(schema.users).where(eq(schema.users.walletAddress, target)))[0];
  if (!dev) throw new Error("dev creator not found");
  if (!me) throw new Error(`no user for wallet ${target} — sign in first`);
  if (dev.id === me.id) {
    console.log("already the same user — nothing to do");
    await sql.end();
    process.exit(0);
  }

  // reassign every creator-owned row from dev creator to the signed-in user
  const a = await db.update(schema.assets).set({ creatorId: me.id }).where(eq(schema.assets.creatorId, dev.id)).returning({ id: schema.assets.id });
  const m = await db.update(schema.moments).set({ creatorId: me.id }).where(eq(schema.moments.creatorId, dev.id)).returning({ id: schema.moments.id });
  const c = await db.update(schema.clipJobs).set({ creatorId: me.id }).where(eq(schema.clipJobs.creatorId, dev.id)).returning({ id: schema.clipJobs.id });
  const p = await db.update(schema.purchases).set({ creatorId: me.id }).where(eq(schema.purchases.creatorId, dev.id)).returning({ id: schema.purchases.id });

  // give the signed-in user a payout wallet so Payouts/withdraw work
  await db
    .update(schema.users)
    .set({ payoutWalletAddress: me.walletAddress, updatedAt: new Date() })
    .where(eq(schema.users.id, me.id));

  await sql.end();
  console.log(`claimed to ${target}:`);
  console.log(`  assets ${a.length}, moments ${m.length}, clipJobs ${c.length}, purchases ${p.length}`);
  console.log(`  payout wallet set; refresh /studio to see the populated demo.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED", e instanceof Error ? e.message : e);
  process.exit(1);
});

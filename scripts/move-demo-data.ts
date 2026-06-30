/**
 * Move creator-owned demo rows from one wallet's user back to the seeded Dev
 * Creator (whose wallet is the demo key 0x06AE…). Use when a tester switches
 * Rabby accounts and wants the populated studio on the new account. DEMO ONLY.
 *   npx tsx --env-file=.env.local scripts/move-demo-data.ts 0x<sourceWallet>
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema";

const DEV_CREATOR_EMAIL = "dev-creator@findling.local";

async function main() {
  const src = (process.argv[2] ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(src)) {
    console.error("usage: move-demo-data.ts 0x<sourceWallet>");
    process.exit(1);
  }
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  const dev = (await db.select().from(schema.users).where(eq(schema.users.email, DEV_CREATOR_EMAIL)))[0];
  const from = (await db.select().from(schema.users).where(eq(schema.users.walletAddress, src)))[0];
  if (!dev) throw new Error("dev creator not found");
  if (!from) throw new Error(`no user for wallet ${src}`);

  const a = await db.update(schema.assets).set({ creatorId: dev.id }).where(eq(schema.assets.creatorId, from.id)).returning({ id: schema.assets.id });
  const m = await db.update(schema.moments).set({ creatorId: dev.id }).where(eq(schema.moments.creatorId, from.id)).returning({ id: schema.moments.id });
  const c = await db.update(schema.clipJobs).set({ creatorId: dev.id }).where(eq(schema.clipJobs.creatorId, from.id)).returning({ id: schema.clipJobs.id });
  const p = await db.update(schema.purchases).set({ creatorId: dev.id }).where(eq(schema.purchases.creatorId, from.id)).returning({ id: schema.purchases.id });

  await sql.end();
  console.log(`moved to Dev Creator (${dev.walletAddress}): assets ${a.length}, moments ${m.length}, clipJobs ${c.length}, purchases ${p.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED", e instanceof Error ? e.message : e);
  process.exit(1);
});

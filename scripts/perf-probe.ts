/**
 * Pinpoint where the studio render time goes: baseline DB round-trip, the
 * catalog read, the earnings (sequential SUMs), and a Supabase signed-URL call.
 *   npx tsx --env-file=.env.local scripts/perf-probe.ts
 */
import { sql as dsql, eq } from "drizzle-orm";
import { db } from "../src/server/db/client";
import { users, moments } from "../src/server/db/schema";
import { getStudioData } from "../src/server/catalog/studio";
import { getEarnings } from "../src/server/ledger/earnings";
import { supabaseStorage } from "../src/server/storage/supabase-storage";

const TARGET = "0xdfd9945e82ae729deabdb0c1d57a16fb884cad83";

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const r = await fn();
  console.log(`  ${String(Date.now() - t0).padStart(5)}ms  ${label}`);
  return r;
}

async function main() {
  // warm the pool
  await db.execute(dsql`select 1`);

  console.log("\n=== single round-trip baseline (x3) ===");
  for (let i = 0; i < 3; i++) await time("select 1", () => db.execute(dsql`select 1`));

  const me = (await db.select().from(users).where(eq(users.walletAddress, TARGET)))[0];
  if (!me) throw new Error("user not found — sign in first");
  const moment = (await db.select().from(moments).where(eq(moments.creatorId, me.id)))[0];

  console.log("\n=== studio render building blocks ===");
  await time("getStudioData(creator)", () => getStudioData(me.id));
  await time("getEarnings(user)  [4 sequential SUMs]", () => getEarnings(me.id));
  if (moment?.posterStorageKey) {
    await time("createSignedDownloadUrl(poster)", () =>
      supabaseStorage.createSignedDownloadUrl(moment.posterStorageKey!, 1800),
    );
  }

  console.log("\n=== second pass (caches warm) ===");
  await time("getStudioData(creator) #2", () => getStudioData(me.id));
  await time("getEarnings(user) #2", () => getEarnings(me.id));

  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED", e instanceof Error ? e.message : e);
  process.exit(1);
});

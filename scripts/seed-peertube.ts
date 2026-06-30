/**
 * Seed the Wanted board with REAL PeerTube creators (CC-licensed videos only).
 *   npx tsx --env-file=.env.local scripts/seed-peertube.ts
 * Env: PT_INSTANCE (default https://peertube2.cpy.re), PT_MAX_PAGES (3), PT_PAGE_SIZE (25)
 *
 * Read-only metadata crawl: reads the instance's public /api/v1/videos, keeps only
 * commercially-clean CC licences, dedupes, and mints `open` claimable_listings
 * attributed to a system seed-finder. No media is downloaded; nothing is sold.
 */
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../src/server/db/client";
import { seedFromPeerTube } from "../src/server/claimable/peertube-sidecar";

const INSTANCE = process.env.PT_INSTANCE ?? "https://peertube2.cpy.re";
const MAX_PAGES = Number(process.env.PT_MAX_PAGES ?? 3);
const PAGE_SIZE = Number(process.env.PT_PAGE_SIZE ?? 25);
const SEED_FINDER_EMAIL = "peertube-seed@findling.local";

async function main() {
  let finder = (
    await db.select().from(schema.users).where(eq(schema.users.email, SEED_FINDER_EMAIL))
  )[0];
  if (!finder) {
    [finder] = await db
      .insert(schema.users)
      .values({ email: SEED_FINDER_EMAIL, displayName: "PeerTube Seed Finder", roles: ["finder"] })
      .returning();
    console.log("created seed-finder user:", finder.id);
  } else {
    console.log("using seed-finder user:", finder.id);
  }

  console.log(`crawling ${INSTANCE} (maxPages=${MAX_PAGES}, pageSize=${PAGE_SIZE}) ...`);
  const res = await seedFromPeerTube({
    instance: INSTANCE,
    seedFinderId: finder.id,
    maxPages: MAX_PAGES,
    pageSize: PAGE_SIZE,
  });
  console.log("seed result:", res);

  const sample = await db
    .select({
      title: schema.claimableListings.title,
      creator: schema.claimableListings.externalIdentity,
      licence: schema.claimableListings.sourceLicenceLabel,
      status: schema.claimableListings.status,
    })
    .from(schema.claimableListings)
    .limit(10);
  console.table(sample);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.claimableListings);
  console.log("total claimable_listings now:", count);
  process.exit(0);
}

main().catch((e) => {
  console.error("seed failed:", e);
  process.exit(1);
});

/**
 * Market stats for the landing — REAL traction numbers from the settled-purchase
 * ledger (no vanity figures). Money is integer micro-USDC.
 */
import { eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/server/db/client";
import { purchases, moments } from "@/server/db/schema";

export interface MarketStats {
  settledCount: number;
  grossMicroUsdc: number;
  creatorMicroUsdc: number;
  finderMicroUsdc: number;
  platformMicroUsdc: number;
  publishedMoments: number;
  latestSlug: string | null;
}

const getCachedMarketStats = unstable_cache(
  async (): Promise<MarketStats> => {
    const [[agg], [momentAgg]] = await Promise.all([
      db
        .select({
          count: sql<number>`count(*)`,
          gross: sql<number>`coalesce(sum(${purchases.grossMicroUsdc}), 0)`,
          creator: sql<number>`coalesce(sum(${purchases.creatorMicroUsdc}), 0)`,
          finder: sql<number>`coalesce(sum(${purchases.finderMicroUsdc}), 0)`,
          platform: sql<number>`coalesce(sum(${purchases.platformMicroUsdc}), 0)`,
        })
        .from(purchases)
        .where(eq(purchases.status, "settled")),
      db
        .select({ count: sql<number>`count(*)` })
        .from(moments)
        .where(eq(moments.status, "published")),
    ]);

    return {
      settledCount: Number(agg?.count ?? 0),
      grossMicroUsdc: Number(agg?.gross ?? 0),
      creatorMicroUsdc: Number(agg?.creator ?? 0),
      finderMicroUsdc: Number(agg?.finder ?? 0),
      platformMicroUsdc: Number(agg?.platform ?? 0),
      publishedMoments: Number(momentAgg?.count ?? 0),
      latestSlug: null,
    };
  },
  ["market-stats-v1"],
  { revalidate: 60, tags: ["market-stats"] },
);

export async function getMarketStats(): Promise<MarketStats> {
  return getCachedMarketStats();
}

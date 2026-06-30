/**
 * Licensable Moment Module.
 *
 * This is the shared "can this be sold right now?" Implementation used by
 * agent detail and License Purchase. Search keeps its SQL-side equivalent so it
 * can use the pgvector index, but the domain rule lives here for direct reads.
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { assets, moments } from "@/server/db/schema";

export const TAKEDOWN_ASSET_STATUSES = ["disabled", "takedown_pending"] as const;
const TAKEDOWN_ASSET_STATUS_SET = new Set<string>(TAKEDOWN_ASSET_STATUSES);

export interface LicensableMoment {
  moment: typeof moments.$inferSelect;
  asset: typeof assets.$inferSelect;
}

export function isLicensableMoment(
  moment: typeof moments.$inferSelect | null | undefined,
  asset: typeof assets.$inferSelect | null | undefined,
): boolean {
  return (
    !!moment &&
    !!asset &&
    moment.status === "published" &&
    !!moment.clipStorageKey &&
    moment.ownershipVerified &&
    !!moment.attestationAt &&
    !TAKEDOWN_ASSET_STATUS_SET.has(asset.status)
  );
}

export async function findLicensableMoment(
  momentId: string,
): Promise<LicensableMoment | null> {
  const moment = (
    await db.select().from(moments).where(eq(moments.id, momentId))
  )[0];
  if (!moment) return null;

  const asset = (
    await db.select().from(assets).where(eq(assets.id, moment.assetId))
  )[0];
  if (!isLicensableMoment(moment, asset)) return null;

  return { moment, asset: asset! };
}

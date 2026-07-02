/**
 * Housekeeping sweeps — keep the unbounded, append-only tables from growing
 * forever. None of these touch money or owned resources; each returns the number
 * of rows it affected so a cron/CLI can log the outcome. Run by scripts/cleanup.ts.
 *
 *  - deleteExpiredNonces:        prune consumed/expired SIWE login nonces.
 *  - sweepOrphanedUploads:       delete storage objects that were presigned but
 *                                never finalized, then mark the intent 'swept'.
 *  - sweepStaleRateLimitBuckets: drop token-bucket rows nobody has touched.
 */
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { siweNonces, uploadIntents, rateLimitBuckets } from "@/server/db/schema";
import { supabaseStorage } from "@/server/storage/supabase-storage";

/**
 * Delete SIWE nonces whose validity window has passed. The app never reaps these
 * (a consumed/expired nonce is simply rejected at verify time), so without this
 * the table grows one row per login attempt forever. Returns rows deleted.
 */
export async function deleteExpiredNonces(): Promise<number> {
  const deleted = await db
    .delete(siweNonces)
    .where(lt(siweNonces.expiresAt, new Date()))
    .returning({ nonce: siweNonces.nonce });
  return deleted.length;
}

/**
 * Sweep upload intents still 'pending' past the cutoff: the browser presigned a
 * key but never finalized it into an asset, so the object (if it was ever PUT)
 * is an orphan. Best-effort delete the storage object, then flip the intent to
 * 'swept'. Per-object errors are caught so one failure can't stall the batch;
 * the row is still marked 'swept' (the object may simply never have been
 * uploaded). Returns the number of intents swept.
 */
export async function sweepOrphanedUploads(
  olderThanMinutes = 30,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const orphans = await db
    .select({
      id: uploadIntents.id,
      storageKey: uploadIntents.storageKey,
    })
    .from(uploadIntents)
    .where(
      and(
        eq(uploadIntents.status, "pending"),
        lt(uploadIntents.createdAt, cutoff),
      ),
    );

  let swept = 0;
  for (const orphan of orphans) {
    try {
      await supabaseStorage.removeObject(orphan.storageKey);
    } catch (e) {
      // A never-uploaded key (no object to remove) or a transient storage error
      // shouldn't stop the sweep — still mark it swept so we don't retry forever.
      console.error(
        "[cleanup] removeObject failed for",
        orphan.storageKey,
        e,
      );
    }
    await db
      .update(uploadIntents)
      .set({ status: "swept", updatedAt: new Date() })
      .where(eq(uploadIntents.id, orphan.id));
    swept += 1;
  }
  return swept;
}

/**
 * Delete rate-limit token buckets not touched within the window. A fully
 * refilled bucket is indistinguishable from a fresh one, so an idle key's row is
 * pure dead weight; the limiter re-creates it on the next request. Returns rows
 * deleted.
 */
export async function sweepStaleRateLimitBuckets(
  olderThanHours = 24,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const deleted = await db
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.updatedAt, cutoff))
    .returning({ key: rateLimitBuckets.key });
  return deleted.length;
}

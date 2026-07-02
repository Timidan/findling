/**
 * Upload-intent tracking — the paper trail a presigned direct upload leaves so
 * orphaned storage objects (presigned but never finalized) can be swept.
 *
 * `recordUploadIntent` is called at presign time (status 'pending');
 * `markUploadIntentCompleted` at the moment the object becomes a real asset. Any
 * intent still 'pending' past the cutoff is fair game for the sweeper, which
 * deletes the object and flips it to 'swept' (see server/maintenance/cleanup.ts).
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { uploadIntents } from "@/server/db/schema";

export interface RecordUploadIntentInput {
  userId: string;
  storageKey: string;
  contentType: string;
}

/**
 * Record a presigned upload's intended key (status 'pending'). Idempotent on the
 * unique storageKey — a retried presign for the same key is a no-op, never a
 * duplicate row or a 500.
 */
export async function recordUploadIntent(
  input: RecordUploadIntentInput,
): Promise<void> {
  await db
    .insert(uploadIntents)
    .values({
      userId: input.userId,
      storageKey: input.storageKey,
      contentType: input.contentType,
      status: "pending",
    })
    .onConflictDoNothing({ target: uploadIntents.storageKey });
}

/**
 * Mark an intent 'completed' once its object has been finalized into an asset —
 * it's now a real deliverable and must NOT be swept. Keyed by the unique
 * storageKey; a missing row (e.g. an import that never presigned) is a harmless
 * no-op.
 */
export async function markUploadIntentCompleted(
  storageKey: string,
): Promise<void> {
  await db
    .update(uploadIntents)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(uploadIntents.storageKey, storageKey));
}

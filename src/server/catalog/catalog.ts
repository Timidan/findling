/**
 * Catalog service — the single owner of asset / clip-job / moment writes.
 *
 * Routes validate + orchestrate; they do NOT touch the DB directly. This keeps
 * supply logic in one testable place and lets us put the right transaction
 * boundaries around multi-row inserts (per design §10 + the backend review).
 *
 * Boundary: catalog never touches Gateway internals or split math.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { assets, clipJobs, moments } from "@/server/db/schema";
import { formatMicroUsdc } from "@/lib/format";
import { checkPublishable } from "./publishable";

/* ---------------- pricing ---------------- */
/** Lowest / highest a creator may price a moment (micro-USDC). $0.001 … $100. */
export const MIN_PRICE_MICRO_USDC = 1_000;
export const MAX_PRICE_MICRO_USDC = 100_000_000;

/** Display snapshot for a micro-USDC price — exact (3–6 dp), matching the app's
 *  money display (formatUsdc) and faithful down to the $0.001 minimum. */
export function priceUsdSnapshotFor(priceMicroUsdc: number): string {
  return formatMicroUsdc(priceMicroUsdc);
}

/**
 * Set a moment's price — owner-scoped. Updates both the integer micro-USDC
 * source of truth and the display snapshot atomically. Returns the updated
 * moment, or null if it doesn't exist or isn't owned by this creator.
 */
export async function setMomentPrice(input: {
  creatorId: string;
  momentId: string;
  priceMicroUsdc: number;
}) {
  const rows = await db
    .update(moments)
    .set({
      priceMicroUsdc: input.priceMicroUsdc,
      priceUsdSnapshot: priceUsdSnapshotFor(input.priceMicroUsdc),
      updatedAt: new Date(),
    })
    .where(
      and(eq(moments.id, input.momentId), eq(moments.creatorId, input.creatorId)),
    )
    .returning();
  return rows[0] ?? null;
}

/* ---------------- publish ---------------- */
/**
 * Publish a draft moment (owner-scoped). Flips draft → published only when
 * `checkPublishable` passes; the WHERE clause re-asserts owner + draft so two
 * concurrent publishes can't race. Embedding (to make it vector-searchable) is a
 * separate step the caller orchestrates.
 */
export async function publishMoment(input: { momentId: string; creatorId: string }) {
  const moment = (
    await db.select().from(moments).where(eq(moments.id, input.momentId))
  )[0];

  // Idempotent: a moment the caller already published is a no-op success, so a
  // retry / double-click / second tab doesn't get a spurious conflict.
  if (
    moment &&
    moment.creatorId === input.creatorId &&
    moment.status === "published"
  ) {
    return { ok: true as const, moment, alreadyPublished: true };
  }

  const check = checkPublishable(moment, input.creatorId);
  if (!check.ok) return { ok: false as const, reason: check.reason };

  const [updated] = await db
    .update(moments)
    .set({ status: "published", updatedAt: new Date() })
    .where(
      and(
        eq(moments.id, input.momentId),
        eq(moments.creatorId, input.creatorId),
        eq(moments.status, "draft"),
      ),
    )
    .returning();
  if (updated) return { ok: true as const, moment: updated, alreadyPublished: false };

  // Lost a race (someone else flipped it first). Re-read: if it's now published
  // and still ours, that's success; otherwise a real conflict.
  const fresh = (
    await db.select().from(moments).where(eq(moments.id, input.momentId))
  )[0];
  if (
    fresh &&
    fresh.creatorId === input.creatorId &&
    fresh.status === "published"
  ) {
    return { ok: true as const, moment: fresh, alreadyPublished: true };
  }
  return { ok: false as const, reason: "publish_conflict" };
}

/* ---------------- upload supply path ---------------- */
/**
 * Default price a freshly-uploaded moment is created with ($0.05); the creator
 * adjusts it before publishing. Must sit within [MIN, MAX]_PRICE_MICRO_USDC.
 */
export const DEFAULT_MOMENT_PRICE_MICRO_USDC = 50_000;

export interface CompleteUploadInput {
  creatorId: string;
  title: string;
  description?: string | null;
  storageKey: string; // the uploaded object — already the final clip
  posterStorageKey?: string | null;
  previewStorageKey: string;
  mimeType: string; // server-sniffed container
  sizeBytes: number; // server-measured size
  durationMs: number; // server-probed duration
  priceMicroUsdc: number;
  priceUsdSnapshot: string;
  attestationText: string;
  attestationVersion: string;
}

/**
 * Finalize a direct upload into BOTH a source asset and a DRAFT moment, atomically
 * (no orphan asset if the moment insert fails). A direct upload is already the
 * final clip, so the uploaded object is the moment's clipStorageKey and there is
 * no clip job. The moment lands as `draft` for the creator to price + publish —
 * this is the path that lets an upload actually become discoverable.
 */
export async function completeUpload(input: CompleteUploadInput) {
  return db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({
        creatorId: input.creatorId,
        sourceType: "upload",
        title: input.title,
        description: input.description ?? null,
        mediaType: "video",
        originalStorageKey: input.storageKey,
        originalMimeType: input.mimeType,
        originalSizeBytes: input.sizeBytes,
        originalDurationMs: input.durationMs,
        ownershipModel: "contributor_attestation",
        ownershipVerified: true,
        attestationText: input.attestationText,
        attestationVersion: input.attestationVersion,
        attestationAt: new Date(),
        status: "draft",
      })
      .returning();

    const [moment] = await tx
      .insert(moments)
      .values({
        assetId: asset.id,
        creatorId: input.creatorId,
        clipJobId: null, // direct upload — the upload itself is the clip
        title: input.title,
        description: input.description ?? null,
        startMs: 0,
        endMs: input.durationMs,
        durationMs: input.durationMs,
        clipStorageKey: input.storageKey,
        clipMimeType: input.mimeType,
        clipSizeBytes: input.sizeBytes,
        posterStorageKey: input.posterStorageKey ?? null,
        previewStorageKey: input.previewStorageKey,
        priceMicroUsdc: input.priceMicroUsdc,
        priceUsdSnapshot: input.priceUsdSnapshot,
        usageType: "video_embed",
        ownershipVerified: true,
        attestationAt: new Date(),
        embeddingStatus: "pending",
        status: "draft",
      })
      .returning();

    return { asset, moment };
  });
}

/* ---------------- youtube supply path ---------------- */
export interface StartYoutubeImportInput {
  creatorId: string;
  title: string;
  videoId: string;
  channelId: string;
  channelTitle?: string | null;
  startMs: number;
  endMs: number;
  attestationText: string;
  attestationVersion: string;
}

/**
 * Atomically create the source asset + its queued clip job. Both rows commit
 * together or neither does — no orphan asset if the clip-job insert fails.
 * The long-running clip work (yt-dlp + ffmpeg + upload) runs AFTER this commit,
 * outside any transaction, then `completeImportedMoment` writes the moment.
 */
export async function startYoutubeImport(input: StartYoutubeImportInput) {
  return db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({
        creatorId: input.creatorId,
        sourceType: "youtube",
        title: input.title,
        youtubeVideoId: input.videoId,
        youtubeChannelId: input.channelId,
        youtubeChannelTitle: input.channelTitle ?? null,
        sourceUrl: `https://www.youtube.com/watch?v=${input.videoId}`,
        ownershipModel: "channel_control",
        ownershipVerified: true,
        attestationText: input.attestationText,
        attestationVersion: input.attestationVersion,
        attestationAt: new Date(),
        status: "draft",
      })
      .returning();

    const [job] = await tx
      .insert(clipJobs)
      .values({
        assetId: asset.id,
        creatorId: input.creatorId,
        sourceType: "youtube",
        startMs: input.startMs,
        endMs: input.endMs,
        status: "queued",
        inputReference: input.videoId,
      })
      .returning();

    return { asset, job };
  });
}

/* ---------------- finalize moment (post-clip, both paths) ---------------- */
export interface CompleteMomentInput {
  assetId: string;
  creatorId: string;
  clipJobId: string;
  title: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  clipStorageKey: string;
  posterStorageKey?: string | null;
  previewStorageKey: string;
  priceMicroUsdc: number;
  priceUsdSnapshot: string;
}

export async function completeImportedMoment(input: CompleteMomentInput) {
  const [moment] = await db
    .insert(moments)
    .values({
      assetId: input.assetId,
      creatorId: input.creatorId,
      clipJobId: input.clipJobId,
      title: input.title,
      startMs: input.startMs,
      endMs: input.endMs,
      durationMs: input.durationMs,
      clipStorageKey: input.clipStorageKey,
      clipMimeType: "video/mp4",
      posterStorageKey: input.posterStorageKey ?? null,
      previewStorageKey: input.previewStorageKey,
      priceMicroUsdc: input.priceMicroUsdc,
      priceUsdSnapshot: input.priceUsdSnapshot,
      usageType: "video_embed",
      ownershipVerified: true,
      attestationAt: new Date(),
      embeddingStatus: "pending",
      status: "draft",
    })
    .returning();
  return moment;
}

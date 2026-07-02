/**
 * Public moment-detail read model for `/m/[id]`.
 *
 * Preview-only by construction: it reuses the canonical licensability check
 * (`findLicensableMoment`) and signs ONLY `previewStorageKey`. The full-quality
 * `clipStorageKey` is the licensed deliverable and is released solely by the x402
 * unlock route after payment — never sign it on this public surface.
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { findLicensableMoment } from "@/server/catalog/licensable";
import { supabaseStorage } from "@/server/storage/supabase-storage";

const PREVIEW_SIGNED_TTL_SECONDS = 60 * 15;

export interface MomentDetail {
  id: string;
  title: string;
  description: string | null;
  creatorName: string;
  sourceType: string;
  durationMs: number;
  priceMicroUsdc: number;
  priceUsd: string;
  usageType: string;
  licence: string;
  posterUrl: string | null;
  previewUrl: string;
}

function licenceLabel(summary: string | null): string {
  const v = (summary ?? "").trim();
  return v || "Standard";
}

function creatorName(c: {
  username: string | null;
  displayName: string | null;
  walletAddress: string | null;
  email: string | null;
}): string {
  if (c.username) return c.username;
  if (c.displayName) return c.displayName;
  if (c.walletAddress) return `${c.walletAddress.slice(0, 6)}...${c.walletAddress.slice(-4)}`;
  return c.email?.split("@")[0] ?? "Creator";
}

export async function getMomentDetail(momentId: string): Promise<MomentDetail | null> {
  const licensable = await findLicensableMoment(momentId);
  if (!licensable) return null;
  const { moment, asset } = licensable;
  // A moment with no public preview can't be shown on the hub (we never expose the clip).
  if (!moment.previewStorageKey) return null;

  const creator = (
    await db
      .select({
        username: users.username,
        displayName: users.displayName,
        walletAddress: users.walletAddress,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, moment.creatorId))
  )[0];

  // previewStorageKey -> the watermarked video; posterStorageKey -> a still .jpg
  // thumbnail (safe to expose). The clip key is NEVER signed here.
  const [previewUrl, posterUrl] = await Promise.all([
    supabaseStorage.createSignedDownloadUrl(
      moment.previewStorageKey,
      PREVIEW_SIGNED_TTL_SECONDS,
    ),
    moment.posterStorageKey
      ? supabaseStorage.createSignedDownloadUrl(
          moment.posterStorageKey,
          PREVIEW_SIGNED_TTL_SECONDS,
        )
      : Promise.resolve(null),
  ]);
  if (!previewUrl) return null;

  return {
    id: moment.id,
    title: moment.title,
    description: moment.description,
    creatorName: creator ? creatorName(creator) : "Creator",
    sourceType: asset.sourceType,
    durationMs: moment.durationMs,
    priceMicroUsdc: moment.priceMicroUsdc,
    priceUsd: moment.priceUsdSnapshot,
    usageType: moment.usageType,
    licence: licenceLabel(moment.licenseSummary),
    posterUrl,
    previewUrl,
  };
}

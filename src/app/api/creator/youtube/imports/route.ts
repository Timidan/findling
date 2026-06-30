import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import {
  startYoutubeImport,
  completeImportedMoment,
  priceUsdSnapshotFor,
  MIN_PRICE_MICRO_USDC,
  MAX_PRICE_MICRO_USDC,
} from "@/server/catalog/catalog";
import { refreshAccessToken } from "@/server/youtube/oauth";
import { getVideoChannelId } from "@/server/youtube/api";
import { tokenCipher } from "@/server/crypto/token-crypto";
import { runClipJob } from "@/server/clip/clip-worker";
import { MAX_MOMENT_MS } from "@/server/clip/ffmpeg";
import { parsePriceMicroUsdcInput, PriceInputError } from "@/server/money/price";
import {
  YOUTUBE_ATTESTATION_TEXT,
  YOUTUBE_ATTESTATION_VERSION,
} from "@/server/ownership/attestation";

export const runtime = "nodejs";
export const maxDuration = 120; // clip jobs (yt-dlp + ffmpeg) can take a bit

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    videoId?: string;
    startMs?: number;
    endMs?: number;
    title?: string;
    priceUsd?: string;
    priceMicroUsdc?: number;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { videoId, startMs, endMs, title, priceUsd } = body;
  if (
    typeof videoId !== "string" ||
    typeof startMs !== "number" ||
    typeof endMs !== "number" ||
    startMs < 0 ||
    endMs <= startMs
  ) {
    return NextResponse.json(
      { error: "videoId, startMs and endMs (endMs > startMs) are required." },
      { status: 400 },
    );
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json(
      { error: "Invalid YouTube video id." },
      { status: 400 },
    );
  }
  if (endMs - startMs > MAX_MOMENT_MS) {
    return NextResponse.json(
      { error: "A moment can be at most 60 seconds." },
      { status: 400 },
    );
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }

  const user = (await db.select().from(users).where(eq(users.id, userId)))[0];
  if (!user?.youtubeRefreshTokenCiphertext || !user.youtubeChannelId) {
    return NextResponse.json(
      { error: "Connect your YouTube channel first." },
      { status: 400 },
    );
  }

  // Ownership re-check: the video MUST belong to the creator's own channel.
  const accessToken = await refreshAccessToken(
    tokenCipher().decrypt(user.youtubeRefreshTokenCiphertext),
  );
  const ownerChannelId = await getVideoChannelId(accessToken, videoId);
  if (ownerChannelId !== user.youtubeChannelId) {
    return NextResponse.json(
      { error: "You can only import moments from your own channel." },
      { status: 403 },
    );
  }

  // Same price envelope the PATCH route enforces ($0.001–$100) — the import path
  // must not be a way to mint an out-of-bounds or sub-min price that x402 charges.
  let priceMicroUsdc: number;
  try {
    priceMicroUsdc = parsePriceMicroUsdcInput(
      { priceMicroUsdc: body.priceMicroUsdc, priceUsd },
      {
        defaultMicroUsdc: 50_000,
        minMicroUsdc: MIN_PRICE_MICRO_USDC,
        maxMicroUsdc: MAX_PRICE_MICRO_USDC,
      },
    );
  } catch (e) {
    if (e instanceof PriceInputError) {
      return NextResponse.json(
        { error: "Price must be between $0.001 and $100." },
        { status: 400 },
      );
    }
    throw e;
  }
  const priceUsdSnapshot = priceUsdSnapshotFor(priceMicroUsdc);

  // asset + queued clip job commit atomically (no orphan asset on failure)
  const { asset, job } = await startYoutubeImport({
    creatorId: userId,
    title: title.trim(),
    videoId,
    channelId: user.youtubeChannelId,
    channelTitle: user.youtubeChannelTitle,
    startMs,
    endMs,
    attestationText: YOUTUBE_ATTESTATION_TEXT,
    attestationVersion: YOUTUBE_ATTESTATION_VERSION,
  });

  let result;
  try {
    // Inline for the single-container MVP; a queue would decouple this.
    result = await runClipJob(job.id);
  } catch {
    return NextResponse.json(
      { error: "Clip processing failed.", clipJobId: job.id },
      { status: 502 },
    );
  }

  const moment = await completeImportedMoment({
    assetId: asset.id,
    creatorId: userId,
    clipJobId: job.id,
    title: title.trim(),
    startMs,
    endMs,
    durationMs: result.durationMs,
    clipStorageKey: result.clipStorageKey,
    posterStorageKey: result.posterStorageKey,
    priceMicroUsdc,
    priceUsdSnapshot,
  });

  return NextResponse.json({
    assetId: asset.id,
    clipJobId: job.id,
    momentId: moment.id,
    durationMs: result.durationMs,
    clipStorageKey: result.clipStorageKey,
  });
}

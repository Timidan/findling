import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdir, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { clipJobs } from "@/server/db/schema";
import {
  probeDurationMs,
  assertWithinMaxDuration,
  createUploadDerivatives,
} from "./ffmpeg";
import { supabaseStorage } from "@/server/storage/supabase-storage";

const execFileP = promisify(execFile);
const TMP = process.env.CLIP_TMP_DIR ?? "/tmp/findling-clips";
const MAX_CLIP_BYTES = 60 * 1024 * 1024; // hard cap on the produced clip

// yt-dlp downloads ONLY the requested section (fast — never the whole video).
// Creator-owned content only; the import route verifies channel ownership first.
async function ytdlpSection(
  videoId: string,
  startSec: number,
  endSec: number,
  outPath: string,
): Promise<void> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  await execFileP(
    "yt-dlp",
    [
      "-f",
      "best[height<=1080][ext=mp4]/best[height<=1080]/best[height<=720]",
      "--download-sections",
      `*${startSec.toFixed(2)}-${endSec.toFixed(2)}`,
      "--remux-video",
      "mp4",
      "--no-playlist",
      "--max-filesize",
      "80M",
      "-o",
      outPath,
      url,
    ],
    { maxBuffer: 1024 * 1024 * 128, timeout: 120_000 },
  );
}

export interface ClipJobResult {
  clipStorageKey: string;
  posterStorageKey: string | null;
  previewStorageKey: string;
  durationMs: number;
}

export async function runClipJob(clipJobId: string): Promise<ClipJobResult> {
  const job = (
    await db.select().from(clipJobs).where(eq(clipJobs.id, clipJobId))
  )[0];
  if (!job) throw new Error("clip job not found");

  await db
    .update(clipJobs)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(clipJobs.id, clipJobId));

  await mkdir(TMP, { recursive: true });
  const clipPath = `${TMP}/${clipJobId}.mp4`;
  const uploadedKeys: string[] = [];

  try {
    if (job.sourceType !== "youtube" || !job.inputReference) {
      throw new Error("unsupported clip source");
    }

    await ytdlpSection(
      job.inputReference,
      job.startMs / 1000,
      job.endMs / 1000,
      clipPath,
    );

    const durationMs = await probeDurationMs(clipPath);
    assertWithinMaxDuration(durationMs); // authoritative ≤60s, from the real file

    const { size: clipBytes } = await stat(clipPath);
    if (clipBytes > MAX_CLIP_BYTES) {
      throw new Error(`Clip exceeds the size cap (${clipBytes} bytes).`);
    }

    const derivatives = await createUploadDerivatives({
      sourceUrl: clipPath,
      creatorId: job.creatorId,
      durationMs,
    });
    uploadedKeys.push(derivatives.previewStorageKey);
    if (derivatives.posterStorageKey) uploadedKeys.push(derivatives.posterStorageKey);

    const clipKey = `clips/${job.creatorId}/${randomUUID()}.mp4`;
    await supabaseStorage.uploadObject({
      storageKey: clipKey,
      body: await readFile(clipPath),
      contentType: "video/mp4",
    });
    uploadedKeys.push(clipKey);

    await db
      .update(clipJobs)
      .set({
        status: "succeeded",
        outputStorageKey: clipKey,
        posterStorageKey: derivatives.posterStorageKey,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clipJobs.id, clipJobId));

    uploadedKeys.length = 0;
    return {
      clipStorageKey: clipKey,
      posterStorageKey: derivatives.posterStorageKey,
      previewStorageKey: derivatives.previewStorageKey,
      durationMs,
    };
  } catch (err) {
    await Promise.all(
      uploadedKeys.map((key) => supabaseStorage.removeObject(key).catch(() => {})),
    );
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(clipJobs)
      .set({
        status: "failed",
        errorCode: "clip_failed",
        errorMessage: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(clipJobs.id, clipJobId));
    throw err;
  } finally {
    await rm(clipPath, { force: true }).catch(() => {});
  }
}

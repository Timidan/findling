import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { supabaseStorage } from "@/server/storage/supabase-storage";

const execFileP = promisify(execFile);
const TMP = process.env.CLIP_TMP_DIR ?? "/tmp/findling-clips";
const FONT_CANDIDATES = [
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/noto/NotoSans-Regular.ttf",
];

/** Authoritative max moment length (the ≤60s rule), enforced from the real file. */
export const MAX_MOMENT_MS = 60_000;

/** Probe a media file's real duration in milliseconds via ffprobe. */
export async function probeDurationMs(filePath: string): Promise<number> {
  const { stdout } = await execFileP("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("Could not determine clip duration.");
  }
  return Math.round(seconds * 1000);
}

export function assertWithinMaxDuration(durationMs: number): void {
  if (durationMs > MAX_MOMENT_MS) {
    throw new Error(
      `Clip is too long (${(durationMs / 1000).toFixed(1)}s, max 60s).`,
    );
  }
}

/**
 * Stream-copy cut [startMs, endMs) from inputPath to outputPath.
 * No re-encode (fast, not a transcoding farm). Cuts align to the nearest
 * keyframe, which is fine for short moments.
 */
export async function streamCopyCut(opts: {
  inputPath: string;
  startMs: number;
  endMs: number;
  outputPath: string;
}): Promise<void> {
  const { inputPath, startMs, endMs, outputPath } = opts;
  if (!Number.isFinite(startMs) || startMs < 0) {
    throw new Error("startMs must be >= 0");
  }
  if (!Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error("endMs must be greater than startMs");
  }
  const ss = (startMs / 1000).toFixed(3);
  const dur = ((endMs - startMs) / 1000).toFixed(3);
  await execFileP("ffmpeg", [
    "-y",
    "-ss",
    ss,
    "-i",
    inputPath,
    "-t",
    dur,
    "-c",
    "copy",
    "-avoid_negative_ts",
    "make_zero",
    outputPath,
  ]);
}

export interface UploadDerivativeInput {
  sourceUrl: string;
  creatorId: string;
  durationMs: number;
}

export interface UploadDerivativeResult {
  posterStorageKey: string | null;
  previewStorageKey: string;
}

function previewFilter(): string {
  const font = FONT_CANDIDATES.find(existsSync);
  if (!font) return "scale=-2:480";
  return `scale=-2:480,drawtext=fontfile=${font}:text='findling preview':fontcolor=white@0.6:fontsize=20:x=(w-text_w)/2:y=h-36:box=1:boxcolor=black@0.35:boxborderw=8`;
}

export async function createUploadDerivatives({
  sourceUrl,
  creatorId,
  durationMs,
}: UploadDerivativeInput): Promise<UploadDerivativeResult> {
  await mkdir(TMP, { recursive: true });
  const id = randomUUID();
  const posterPath = `${TMP}/upload-${id}.jpg`;
  const previewPath = `${TMP}/upload-preview-${id}.mp4`;
  const previewTimeoutMs = Math.min(120_000, Math.max(30_000, durationMs * 2));
  const uploadedKeys: string[] = [];

  try {
    let posterReady = false;
    try {
      await execFileP(
        "ffmpeg",
        [
          "-y",
          "-ss",
          "0",
          "-i",
          sourceUrl,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          posterPath,
        ],
        { timeout: 30_000 },
      );
      posterReady = true;
    } catch {
      // Poster is helpful but not required; preview below is the hard gate.
    }

    await execFileP(
      "ffmpeg",
      [
        "-y",
        "-i",
        sourceUrl,
        "-vf",
        previewFilter(),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "30",
        "-an",
        "-movflags",
        "+faststart",
        previewPath,
      ],
      { timeout: previewTimeoutMs, maxBuffer: 1024 * 1024 * 32 },
    );

    const previewStorageKey = `previews/${creatorId}/${randomUUID()}.mp4`;
    await supabaseStorage.uploadObject({
      storageKey: previewStorageKey,
      body: await readFile(previewPath),
      contentType: "video/mp4",
    });
    uploadedKeys.push(previewStorageKey);

    let posterStorageKey: string | null = null;
    if (posterReady) {
      const posterKey = `clips/${creatorId}/${randomUUID()}.jpg`;
      try {
        await supabaseStorage.uploadObject({
          storageKey: posterKey,
          body: await readFile(posterPath),
          contentType: "image/jpeg",
        });
        uploadedKeys.push(posterKey);
        posterStorageKey = posterKey;
      } catch {
        // Poster is optional. A preview-only clip is still discoverable.
      }
    }

    return { posterStorageKey, previewStorageKey };
  } catch (e) {
    await Promise.all(
      uploadedKeys.map((key) => supabaseStorage.removeObject(key).catch(() => {})),
    );
    throw e;
  } finally {
    await rm(posterPath, { force: true }).catch(() => {});
    await rm(previewPath, { force: true }).catch(() => {});
  }
}

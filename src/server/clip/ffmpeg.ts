import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

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

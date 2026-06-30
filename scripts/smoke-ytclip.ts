/** Live proof of the YouTube clip pipeline: yt-dlp section -> ffprobe -> Supabase. */
import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { probeDurationMs, assertWithinMaxDuration } from "../src/server/clip/ffmpeg";

async function main() {
  const videoId = "jNQXAC9IVRw"; // "Me at the zoo" — public, ~19s
  const startSec = 2;
  const endSec = 10;
  const dir = "/tmp/findling-clips";
  mkdirSync(dir, { recursive: true });
  const out = `${dir}/ytsmoke-${randomUUID()}.mp4`;

  console.log(`yt-dlp: section ${startSec}-${endSec}s of ${videoId} ...`);
  execFileSync(
    "yt-dlp",
    [
      "-f",
      "best[height<=1080][ext=mp4]/best[height<=1080]/best[height<=720]",
      "--download-sections",
      `*${startSec}-${endSec}`,
      "--remux-video",
      "mp4",
      "--no-playlist",
      "--max-filesize",
      "80M",
      "-o",
      out,
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
    { stdio: ["ignore", "ignore", "inherit"], timeout: 120_000 },
  );

  const durationMs = await probeDurationMs(out);
  assertWithinMaxDuration(durationMs);
  const bytes = readFileSync(out).length;
  console.log(`✓ clip: ${durationMs} ms · ${bytes} bytes`);

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const key = `clips/smoke/${randomUUID()}.mp4`;
  const { error } = await supa.storage
    .from("moments")
    .upload(key, readFileSync(out), { contentType: "video/mp4" });
  if (error) throw error;
  console.log(`✓ uploaded to Supabase: ${key}`);

  const { data: signed } = await supa.storage
    .from("moments")
    .createSignedUrl(key, 60);
  console.log(`✓ signed url: ${signed?.signedUrl ? "ok" : "MISSING"}`);

  unlinkSync(out);
  console.log("\nYT CLIP PIPELINE OK ✅  (yt-dlp section → ffprobe → Supabase)");
}

main().catch((e) => {
  console.error("\nYT CLIP FAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

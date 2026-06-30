/** Live smoke test for the clip-worker ffmpeg primitives. */
import { execFileSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  probeDurationMs,
  streamCopyCut,
  assertWithinMaxDuration,
} from "../src/server/clip/ffmpeg";

async function main() {
  const src = `/tmp/findling-clip-src-${randomUUID()}.mp4`;
  const out = `/tmp/findling-clip-out-${randomUUID()}.mp4`;

  // 5s source, every frame a keyframe (-g 1) so stream-copy cuts are precise.
  execFileSync(
    "ffmpeg",
    ["-y", "-f", "lavfi", "-i", "testsrc=duration=5:size=320x240:rate=10", "-g", "1", "-pix_fmt", "yuv420p", src],
    { stdio: "ignore" },
  );
  console.log("✓ source duration:", await probeDurationMs(src), "ms (expect ~5000)");

  await streamCopyCut({ inputPath: src, startMs: 1000, endMs: 3000, outputPath: out });
  const cutMs = await probeDurationMs(out);
  console.log("✓ cut [1000,3000) duration:", cutMs, "ms (expect ~2000)");

  assertWithinMaxDuration(cutMs);
  console.log("✓ within 60s cap");

  // the ≤60s guard rejects an over-length clip
  let rejected = false;
  try {
    assertWithinMaxDuration(61_000);
  } catch {
    rejected = true;
  }
  console.log("✓ rejects >60s:", rejected);

  unlinkSync(src);
  unlinkSync(out);
  if (cutMs < 1500 || cutMs > 2600 || !rejected) {
    throw new Error("clip primitives produced unexpected results");
  }
  console.log("\nSMOKE CLIP OK ✅");
}

main().catch((e) => {
  console.error("\nSMOKE CLIP FAILED ❌", e);
  process.exit(1);
});

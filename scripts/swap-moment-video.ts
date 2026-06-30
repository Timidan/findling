/**
 * Propagate the snowboarding clip into the Feed/DB: trim an ~8s moment from the
 * 55s run, upload it (+ poster) to Supabase, and point the existing published
 * moment at it so the Feed + new receipts show snowboarding (coherent demo).
 * The historical Arc receipt keeps its snapshotted title — receipts are immutable.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import * as schema from "../src/server/db/schema";
import { upsertMomentEmbedding } from "../src/server/search/embeddings";
import { MockEmbeddingProvider } from "../src/server/search/mock-embedding-provider";

const SRC = "public/demo/snowboard.mp4";
const TITLE = "Snowboard — powder line";

async function main() {
  const clip = `/tmp/snow-moment-${randomUUID()}.mp4`;
  const poster = `/tmp/snow-moment-${randomUUID()}.jpg`;

  console.log("trimming an 8s moment (re-encode, faststart)…");
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-ss", "22", "-i", SRC, "-t", "8",
    "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-an",
    "-movflags", "+faststart", clip,
  ], { stdio: ["ignore", "ignore", "inherit"] });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "2", "-i", clip, "-frames:v", "1", "-q:v", "2", poster], { stdio: ["ignore", "ignore", "inherit"] });

  const durationMs = Math.round(
    Number(
      execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", clip])
        .toString()
        .trim(),
    ) * 1000,
  );
  console.log(`✓ clip ${durationMs}ms`);

  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const clipKey = `clips/demo/snowboard-${randomUUID()}.mp4`;
  const posterKey = `clips/demo/snowboard-${randomUUID()}.jpg`;
  for (const [key, file, type] of [
    [clipKey, clip, "video/mp4"],
    [posterKey, poster, "image/jpeg"],
  ] as const) {
    const { error } = await supa.storage.from("moments").upload(key, readFileSync(file), { contentType: type, upsert: true });
    if (error) throw error;
  }
  console.log(`✓ uploaded ${clipKey}`);

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });
  const moment = (await db.select().from(schema.moments).limit(1))[0];
  if (!moment) throw new Error("no moment");

  await db
    .update(schema.moments)
    .set({
      title: TITLE,
      description: "An 8-second powder line — a licensable snowboard moment.",
      clipStorageKey: clipKey,
      posterStorageKey: posterKey,
      clipMimeType: "video/mp4",
      durationMs,
      embeddingStatus: "pending",
      updatedAt: new Date(),
    })
    .where(eq(schema.moments.id, moment.id));
  // keep the source asset plausible
  await db
    .update(schema.assets)
    .set({ title: TITLE, updatedAt: new Date() })
    .where(eq(schema.assets.id, moment.assetId));
  console.log(`✓ moment "${TITLE}" now points at the snowboard clip`);

  await upsertMomentEmbedding(moment.id, new MockEmbeddingProvider());
  console.log("✓ re-embedded");

  unlinkSync(clip);
  unlinkSync(poster);
  await sql.end();
  console.log("\nSNOWBOARD MOMENT LIVE ✅  Feed + new receipts now show snowboarding");
}

main().catch((e) => {
  console.error("\nFAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

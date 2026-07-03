/**
 * Generate missing low-res, watermarked PREVIEW renditions and first-frame
 * POSTERS for moments that already have a licensed clip. The Feed serves these
 * previews/posters; the full-quality clipStorageKey is the licensed deliverable,
 * signed only by the x402 unlock route AFTER payment.
 *
 *   npx tsx --env-file=.env.local scripts/generate-previews.ts
 *   npx tsx --env-file=.env.local scripts/generate-previews.ts --replace-previews
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import * as schema from "../src/server/db/schema";

const FONT_CANDIDATES = [
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/noto/NotoSans-Regular.ttf",
];
const REPLACE_PREVIEWS = process.argv.includes("--replace-previews");

async function main() {
  const font = FONT_CANDIDATES.find(existsSync) ?? null;
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  const rows = await db
    .select()
    .from(schema.moments)
    .where(
      REPLACE_PREVIEWS
        ? isNotNull(schema.moments.clipStorageKey)
        : and(
            isNotNull(schema.moments.clipStorageKey),
            or(
              isNull(schema.moments.previewStorageKey),
              isNull(schema.moments.posterStorageKey),
            )!,
          ),
    );
  console.log(
    `${rows.length} moment(s) need ${REPLACE_PREVIEWS ? "preview refresh" : "media backfill"}${font ? " (watermarked)" : " (no font, plain 480p)"}\n`,
  );

  for (const m of rows) {
    const src = `/tmp/clip-${randomUUID()}.mp4`;
    const poster = `/tmp/poster-${randomUUID()}.jpg`;
    const out = `/tmp/preview-${randomUUID()}.mp4`;

    try {
      const dl = await supa.storage.from("moments").download(m.clipStorageKey!);
      if (dl.error) throw dl.error;
      writeFileSync(src, Buffer.from(await dl.data.arrayBuffer()));

      const patch: {
        updatedAt: Date;
        posterStorageKey?: string;
        previewStorageKey?: string;
      } = {
        updatedAt: new Date(),
      };
      const oldPreviewKey = m.previewStorageKey;

      if (!m.posterStorageKey) {
        execFileSync(
          "ffmpeg",
          ["-y", "-loglevel", "error", "-ss", "0", "-i", src, "-frames:v", "1", "-q:v", "3", poster],
          { stdio: ["ignore", "ignore", "inherit"] },
        );
        const posterKey = `clips/${m.creatorId}/poster-${randomUUID()}.jpg`;
        const posterUpload = await supa.storage
          .from("moments")
          .upload(posterKey, readFileSync(poster), { contentType: "image/jpeg", upsert: true });
        if (posterUpload.error) throw posterUpload.error;
        patch.posterStorageKey = posterKey;
      }

      if (REPLACE_PREVIEWS || !m.previewStorageKey) {
        const vf = font
          ? `scale=-2:480,drawtext=fontfile=${font}:text='findling preview':fontcolor=white@0.6:fontsize=20:x=(w-text_w)/2:y=h-36:box=1:boxcolor=black@0.35:boxborderw=8`
          : `scale=-2:480`;
        execFileSync(
          "ffmpeg",
          [
            "-y",
            "-loglevel",
            "error",
            "-i",
            src,
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "30",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-shortest",
            "-movflags",
            "+faststart",
            out,
          ],
          { stdio: ["ignore", "ignore", "inherit"] },
        );

        const previewKey = `previews/${m.creatorId}/preview-${randomUUID()}.mp4`;
        const previewUpload = await supa.storage
          .from("moments")
          .upload(previewKey, readFileSync(out), { contentType: "video/mp4", upsert: true });
        if (previewUpload.error) throw previewUpload.error;
        patch.previewStorageKey = previewKey;
      }

      await db
        .update(schema.moments)
        .set(patch)
        .where(eq(schema.moments.id, m.id));

      if (REPLACE_PREVIEWS && oldPreviewKey && patch.previewStorageKey) {
        await supa.storage.from("moments").remove([oldPreviewKey]);
      }

      console.log(`  ✓ "${m.title}"`);
    } finally {
      if (existsSync(src)) unlinkSync(src);
      if (existsSync(poster)) unlinkSync(poster);
      if (existsSync(out)) unlinkSync(out);
    }
  }

  await sql.end();
  console.log("\ndone - Feed now serves previews; licensed clips stay behind payment.");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nFAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

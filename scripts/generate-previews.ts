/**
 * Generate low-res, watermarked PREVIEW renditions for any published moment that
 * has a licensed clip but no preview yet, and set `previewStorageKey`. The Feed
 * serves these previews; the full-quality clipStorageKey is the licensed
 * deliverable, signed only by the x402 unlock route AFTER payment.
 *
 *   npx tsx --env-file=.env.local scripts/generate-previews.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import * as schema from "../src/server/db/schema";

const FONT_CANDIDATES = [
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/noto/NotoSans-Regular.ttf",
];

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
      and(
        isNotNull(schema.moments.clipStorageKey),
        isNull(schema.moments.previewStorageKey),
      ),
    );
  console.log(`${rows.length} moment(s) need a preview${font ? " (watermarked)" : " (no font → plain 480p)"}\n`);

  for (const m of rows) {
    const src = `/tmp/clip-${randomUUID()}.mp4`;
    const out = `/tmp/preview-${randomUUID()}.mp4`;

    const dl = await supa.storage.from("moments").download(m.clipStorageKey!);
    if (dl.error) throw dl.error;
    writeFileSync(src, Buffer.from(await dl.data.arrayBuffer()));

    const vf = font
      ? `scale=-2:480,drawtext=fontfile=${font}:text='findling preview':fontcolor=white@0.6:fontsize=20:x=(w-text_w)/2:y=h-36:box=1:boxcolor=black@0.35:boxborderw=8`
      : `scale=-2:480`;
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-i", src, "-vf", vf, "-c:v", "libx264", "-preset", "fast", "-crf", "30", "-an", "-movflags", "+faststart", out],
      { stdio: ["ignore", "ignore", "inherit"] },
    );

    const key = `previews/demo/preview-${randomUUID()}.mp4`;
    const up = await supa.storage
      .from("moments")
      .upload(key, readFileSync(out), { contentType: "video/mp4", upsert: true });
    if (up.error) throw up.error;

    await db
      .update(schema.moments)
      .set({ previewStorageKey: key, updatedAt: new Date() })
      .where(eq(schema.moments.id, m.id));

    unlinkSync(src);
    unlinkSync(out);
    console.log(`  ✓ "${m.title}" → ${key}`);
  }

  await sql.end();
  console.log("\ndone — Feed now serves previews; licensed clips stay behind payment.");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nFAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

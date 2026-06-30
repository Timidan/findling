/**
 * FULL clip flow from scratch: trim a fresh moment from the source video, render
 * poster + watermarked preview, upload all three, create a published+attested
 * asset+moment priced in USDC, embed it for search, and have a finder curate it
 * (so the finder earns the 12% when it sells). Prints the new moment + finder id.
 *   npx tsx --env-file=.env.local scripts/new-moment.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import * as schema from "../src/server/db/schema";
import { submitCuration } from "../src/server/catalog/curation";
import { upsertMomentEmbedding } from "../src/server/search/embeddings";

const SRC = process.env.SRC ?? "public/demo/snowboard.mp4";
const TITLE = process.env.TITLE ?? "Snowboard — backcountry spray";
const DESC =
  process.env.DESC ??
  "An 8-second backcountry spray off a wind lip — a licensable snowboard moment.";
const SS = Number(process.env.SS ?? 38), DUR = Number(process.env.DUR ?? 8);
// rights + commerce metadata (defaults reproduce the snowboard demo seed)
const SOURCE_TYPE = (process.env.SOURCE_TYPE ?? "youtube") as "upload" | "youtube";
const OWNERSHIP_MODEL = (process.env.OWNERSHIP_MODEL ?? "channel_control") as
  | "channel_control"
  | "contributor_attestation";
const ATTESTATION = process.env.ATTESTATION ?? null;
const PRICE_MICRO = Number(process.env.PRICE_MICRO ?? 50_000);
const SLUG = process.env.SLUG ?? "spray";
const TAGS = (process.env.TAGS ?? "snowboard,backcountry,spray,winter")
  .split(",").map((s) => s.trim()).filter(Boolean);
const CAPTION = process.env.CAPTION ?? "Backcountry spray off a wind lip — great for winter recaps.";
const RELEVANCE = process.env.RELEVANCE ?? "snowboard powder spray winter sports action";
const CREATOR_EMAIL = "dev-creator@findling.local";
const FINDER_EMAIL = "loop-finder@findling.test";
const FONTS = ["/usr/share/fonts/TTF/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"];

async function main() {
  const font = FONTS.find(existsSync) ?? null;
  const clip = `/tmp/nm-${randomUUID()}.mp4`;
  const poster = `/tmp/nm-${randomUUID()}.jpg`;
  const preview = `/tmp/nm-${randomUUID()}.mp4`;

  console.log("trimming clip + poster + preview…");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(SS), "-i", SRC, "-t", String(DUR), "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-an", "-movflags", "+faststart", clip], { stdio: ["ignore", "ignore", "inherit"] });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "2", "-i", clip, "-frames:v", "1", "-q:v", "2", poster], { stdio: ["ignore", "ignore", "inherit"] });
  const vf = font ? `scale=-2:480,drawtext=fontfile=${font}:text='findling preview':fontcolor=white@0.6:fontsize=20:x=(w-text_w)/2:y=h-36:box=1:boxcolor=black@0.35:boxborderw=8` : "scale=-2:480";
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", clip, "-vf", vf, "-c:v", "libx264", "-preset", "fast", "-crf", "30", "-an", "-movflags", "+faststart", preview], { stdio: ["ignore", "ignore", "inherit"] });

  const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", clip]).toString().trim()) * 1000);

  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const id = randomUUID();
  const clipKey = `clips/demo/${SLUG}-${id}.mp4`;
  const posterKey = `clips/demo/${SLUG}-${id}.jpg`;
  const previewKey = `previews/demo/${SLUG}-${id}.mp4`;
  for (const [key, file, type] of [[clipKey, clip, "video/mp4"], [posterKey, poster, "image/jpeg"], [previewKey, preview, "video/mp4"]] as const) {
    const { error } = await supa.storage.from("moments").upload(key, readFileSync(file), { contentType: type, upsert: true });
    if (error) throw error;
  }
  console.log("✓ uploaded clip + poster + preview");

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });
  const creator = (await db.select().from(schema.users).where(eq(schema.users.email, CREATOR_EMAIL)))[0];
  if (!creator) throw new Error("dev creator not found");

  const now = new Date();
  const [asset] = await db.insert(schema.assets).values({
    creatorId: creator.id, sourceType: SOURCE_TYPE, title: TITLE, mediaType: "video",
    ownershipModel: OWNERSHIP_MODEL, ownershipVerified: true,
    attestationText: ATTESTATION, attestationVersion: ATTESTATION ? "demo-1" : null,
    attestationAt: now, status: "published",
  }).returning();

  const [moment] = await db.insert(schema.moments).values({
    assetId: asset.id, creatorId: creator.id, title: TITLE, description: DESC,
    startMs: SS * 1000, endMs: (SS + DUR) * 1000, durationMs,
    clipStorageKey: clipKey, clipMimeType: "video/mp4", posterStorageKey: posterKey, previewStorageKey: previewKey,
    priceMicroUsdc: PRICE_MICRO, priceUsdSnapshot: (PRICE_MICRO / 1_000_000).toFixed(3), usageType: "video_embed",
    ownershipVerified: true, attestationAt: now, status: "published", embeddingStatus: "pending",
  }).returning();
  console.log(`✓ created published moment "${TITLE}" (${moment.id})`);

  await upsertMomentEmbedding(moment.id);
  console.log("✓ embedded for search");

  // finder curates it (earns 12% when it sells)
  let finder = (await db.select().from(schema.users).where(eq(schema.users.email, FINDER_EMAIL)))[0];
  if (!finder) {
    [finder] = await db.insert(schema.users).values({ email: FINDER_EMAIL, displayName: "Loop Finder", roles: ["finder"], payoutWalletAddress: process.env.AGENT_ADDRESS ?? null }).returning();
  }
  const curation = await submitCuration({ momentId: moment.id, finderId: finder.id, tags: TAGS, caption: CAPTION, relevanceText: RELEVANCE });
  console.log(`✓ finder ${finder.id} curated it (curation ${curation.id})`);

  for (const f of [clip, poster, preview]) { try { unlinkSync(f); } catch {} }
  await sql.end();
  console.log(`\nNEW MOMENT READY ✅\n  momentId=${moment.id}\n  price=0.05 USDC · published · embedded · curated`);
  process.exit(0);
}

main().catch((e) => { console.error("\nFAILED ❌", e instanceof Error ? e.message : e); process.exit(1); });

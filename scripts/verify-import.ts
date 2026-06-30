import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import * as schema from "../src/server/db/schema";

async function main() {
  const momentId = process.argv[2];
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  const m = (
    await db.select().from(schema.moments).where(eq(schema.moments.id, momentId))
  )[0];
  if (!m) throw new Error("moment not found");
  const asset = (
    await db.select().from(schema.assets).where(eq(schema.assets.id, m.assetId))
  )[0];
  const job = m.clipJobId
    ? (
        await db
          .select()
          .from(schema.clipJobs)
          .where(eq(schema.clipJobs.id, m.clipJobId))
      )[0]
    : null;

  console.log("moment:", {
    title: m.title,
    durationMs: m.durationMs,
    priceMicroUsdc: m.priceMicroUsdc,
    priceUsd: m.priceUsdSnapshot,
    usageType: m.usageType,
    status: m.status,
    embeddingStatus: m.embeddingStatus,
    clipStorageKey: m.clipStorageKey,
  });
  console.log("asset:", {
    sourceType: asset?.sourceType,
    youtubeVideoId: asset?.youtubeVideoId,
    channel: asset?.youtubeChannelId,
    ownershipModel: asset?.ownershipModel,
    ownershipVerified: asset?.ownershipVerified,
    attestation: asset?.attestationText,
  });
  console.log("clipJob:", {
    status: job?.status,
    output: job?.outputStorageKey,
    poster: job?.posterStorageKey,
  });

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: signed } = await supa.storage
    .from("moments")
    .createSignedUrl(m.clipStorageKey!, 60);
  console.log("clip object signed URL:", signed?.signedUrl ? "OK ✓" : "MISSING");
  if (m.posterStorageKey) {
    const { data: p } = await supa.storage
      .from("moments")
      .createSignedUrl(m.posterStorageKey, 60);
    console.log("poster object signed URL:", p?.signedUrl ? "OK ✓" : "MISSING");
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

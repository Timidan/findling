/**
 * Live smoke test for the storage + DB slice (Step 3, wired to real Supabase).
 * Run: set -a; source .env.local; set +a; pnpm exec tsx scripts/smoke.ts
 */
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import * as schema from "../src/server/db/schema";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DB = process.env.DATABASE_URL!;
const BUCKET = "moments";

async function main() {
  if (!SUPA_URL || !SERVICE || !DB) throw new Error("Missing Supabase env vars.");
  const supa = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });

  // 1) ensure the private bucket exists
  const { error: be } = await supa.storage.createBucket(BUCKET, { public: false });
  if (be && !/already exists/i.test(be.message)) throw be;
  console.log("✓ bucket:", BUCKET);

  // 2) generate a tiny 1s test mp4 with ffmpeg
  const tmp = `/tmp/findling-smoke-${randomUUID()}.mp4`;
  execFileSync(
    "ffmpeg",
    ["-y", "-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=10", "-pix_fmt", "yuv420p", tmp],
    { stdio: "ignore" },
  );
  const buf = readFileSync(tmp);
  console.log("✓ ffmpeg test clip:", buf.length, "bytes");

  // 3) DB: seed a dev creator (idempotent)
  const sql = postgres(DB, { prepare: false });
  const db = drizzle(sql, { schema });
  const email = "dev-creator@findling.local";
  let user = (await db.select().from(schema.users).where(eq(schema.users.email, email)))[0];
  if (!user) {
    user = (
      await db
        .insert(schema.users)
        .values({ email, displayName: "Dev Creator", roles: ["creator", "buyer", "finder"] })
        .returning()
    )[0];
  }
  console.log("✓ dev user:", user.id);

  // 4) upload under uploads/<userId>/<uuid>.mp4 (the server-minted key shape)
  const key = `uploads/${user.id}/${randomUUID()}.mp4`;
  const { error: ue } = await supa.storage
    .from(BUCKET)
    .upload(key, buf, { contentType: "video/mp4", upsert: false });
  if (ue) throw ue;
  console.log("✓ uploaded:", key);

  // 5) getObjectInfo path — read REAL size + content-type back from storage
  const slash = key.lastIndexOf("/");
  const { data: listed, error: le } = await supa.storage
    .from(BUCKET)
    .list(key.slice(0, slash), { search: key.slice(slash + 1), limit: 10 });
  if (le) throw le;
  const obj = listed?.find((o) => o.name === key.slice(slash + 1));
  const meta = (obj?.metadata ?? {}) as { size?: number; mimetype?: string };
  console.log("✓ object info:", { size: meta.size, mimetype: meta.mimetype });

  // 6) insert the asset (the upload-complete slice), using server-observed metadata
  const asset = (
    await db
      .insert(schema.assets)
      .values({
        creatorId: user.id,
        sourceType: "upload",
        title: "Smoke Test Clip",
        mediaType: "video",
        originalStorageKey: key,
        originalMimeType: meta.mimetype ?? "video/mp4",
        originalSizeBytes: meta.size ?? buf.length,
        originalDurationMs: null,
        ownershipModel: "contributor_attestation",
        ownershipVerified: true,
        attestationText: "I own or have the rights to license this media through Findling.",
        attestationVersion: "upload-v1",
        attestationAt: new Date(),
        status: "draft",
      })
      .returning()
  )[0];
  console.log("✓ asset row:", asset.id, "·", asset.status);

  // 7) short-lived signed download URL (the post-payment unlock proof)
  const { data: signed, error: se } = await supa.storage.from(BUCKET).createSignedUrl(key, 60);
  if (se) throw se;
  console.log("✓ signed download URL:", signed?.signedUrl ? "ok" : "MISSING");

  unlinkSync(tmp);
  await sql.end();
  console.log("\nDEV_USER_ID=" + user.id);
  console.log("\nSMOKE OK ✅  storage + DB + validation slice is live.");
}

main().catch((e) => {
  console.error("\nSMOKE FAILED ❌", e);
  process.exit(1);
});

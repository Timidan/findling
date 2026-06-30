/**
 * Backfill `source_thumbnail_url` for existing PeerTube "Wanted" listings.
 *
 * For each open/claimed peertube_channel listing with no thumbnail, re-fetches the
 * channel's recent videos via the SSRF-guarded `fetchPublicJson`, matches the listing
 * title to a video name (the title IS the matched video's name), falls back to the
 * latest video, validates the thumbnail to the channel's https origin, and stores it.
 * Sequential — gentle on the ~38 instances.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-listing-thumbnails.ts
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, isNull } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import { fetchPublicJson } from "../src/server/claimable/public-fetch";
import { thumbnailUrlForVideo } from "../src/server/claimable/peertube-sidecar";

function channelVideosUrl(channelRef: string): { url: URL; origin: string } | null {
  try {
    const u = new URL(channelRef);
    const handle = u.pathname.split("/").filter(Boolean).pop();
    if (!handle) return null;
    const api = new URL(`/api/v1/video-channels/${handle}/videos`, u.origin);
    api.searchParams.set("count", "30");
    api.searchParams.set("sort", "-publishedAt");
    return { url: api, origin: u.origin };
  } catch {
    return null;
  }
}

const norm = (s: string) => s.trim().toLowerCase();

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  const rows = await db
    .select()
    .from(schema.claimableListings)
    .where(
      and(
        eq(schema.claimableListings.externalIdentityKind, "peertube_channel"),
        inArray(schema.claimableListings.status, ["open", "claimed"]),
        isNull(schema.claimableListings.sourceThumbnailUrl),
      ),
    );
  console.log(`backfilling ${rows.length} listings…`);

  let filled = 0;
  let missed = 0;
  for (const row of rows) {
    const target = row.externalRef ? channelVideosUrl(row.externalRef) : null;
    if (!target) {
      missed += 1;
      continue;
    }
    let body: unknown;
    try {
      body = await fetchPublicJson(target.url, {
        timeoutMs: 6000,
        maxBytes: 512 * 1024,
        headers: { accept: "application/json" },
      });
    } catch (e) {
      console.log(`  ✗ ${row.title.slice(0, 44)} — ${e instanceof Error ? e.message : e}`);
      missed += 1;
      continue;
    }
    const data =
      body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)
        ? ((body as { data: Record<string, unknown>[] }).data)
        : [];
    if (data.length === 0) {
      missed += 1;
      continue;
    }
    const match =
      data.find(
        (v) => typeof v.name === "string" && norm(v.name as string) === norm(row.title),
      ) ?? data[0];
    const thumb = thumbnailUrlForVideo(match, target.origin);
    if (!thumb) {
      missed += 1;
      continue;
    }
    await db
      .update(schema.claimableListings)
      .set({ sourceThumbnailUrl: thumb })
      .where(eq(schema.claimableListings.id, row.id));
    filled += 1;
    console.log(`  ✓ ${row.title.slice(0, 44)} -> ${thumb}`);
  }

  console.log(`\nfilled ${filled}, missed ${missed} of ${rows.length}`);
  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("BACKFILL FAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

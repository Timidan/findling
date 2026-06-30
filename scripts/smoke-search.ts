/**
 * Live proof of the semantic-search pipeline (mock embedder, no OpenAI key):
 *   embed moment → store 1536-dim vector in pgvector → idempotent re-embed →
 *   cosine query via the HNSW index returns the moment, exact-text query ≈ 1.0.
 * Publishes the real moment + leaves its embedding (correct persistent state).
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import { MockEmbeddingProvider } from "../src/server/search/mock-embedding-provider";
import { EMBEDDING_DIMENSIONS } from "../src/server/search/types";
import { buildMomentSourceText } from "../src/server/search/source-text";
import {
  upsertMomentEmbedding,
  searchMoments,
} from "../src/server/search/embeddings";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });
  const provider = new MockEmbeddingProvider();

  const moment = (await db.select().from(schema.moments).limit(1))[0];
  if (!moment) throw new Error("no moment to embed");
  console.log(`moment: "${moment.title}" (${moment.id})`);

  // search filters on published — make sure the demo moment is published
  if (moment.status !== "published") {
    await db
      .update(schema.moments)
      .set({ status: "published", updatedAt: new Date() })
      .where(eq(schema.moments.id, moment.id));
    console.log("  · published the moment");
  }

  // pre-clean: drop any prior embedding so [1] proves a FRESH embed (re-runnable)
  await db
    .delete(schema.momentEmbeddings)
    .where(eq(schema.momentEmbeddings.momentId, moment.id));

  console.log("\n[1] embed + store:");
  const first = await upsertMomentEmbedding(moment.id, provider);
  assert(first.status === "embedded", "first upsert embedded the moment");
  const row = (
    await db
      .select()
      .from(schema.momentEmbeddings)
      .where(eq(schema.momentEmbeddings.momentId, moment.id))
  )[0];
  assert(!!row, "moment_embeddings row exists");
  assert(row.provider === "mock" && row.model === "mock-hash", "provider/model stored");
  assert(
    Array.isArray(row.embedding) && row.embedding.length === EMBEDDING_DIMENSIONS,
    `stored vector is ${EMBEDDING_DIMENSIONS}-dim`,
  );

  console.log("\n[2] idempotent re-embed (unchanged hash → skip):");
  const second = await upsertMomentEmbedding(moment.id, provider);
  assert(second.status === "unchanged", "re-embed skipped (hash unchanged)");
  assert(second.sourceTextHash === first.sourceTextHash, "same source hash");

  console.log("\n[3] cosine query via HNSW returns the moment:");
  const byTitle = await searchMoments(moment.title, { limit: 5 }, provider);
  assert(byTitle.length >= 1, "query returns at least one hit");
  assert(byTitle[0].momentId === moment.id, "the moment is the top hit");
  assert(byTitle[0].score > 0 && byTitle[0].score <= 1, `score in (0,1]: ${byTitle[0].score.toFixed(4)}`);

  console.log("\n[4] exact source-text query proves an exact DB round-trip:");
  const cur = await db
    .select()
    .from(schema.curations)
    .where(eq(schema.curations.momentId, moment.id));
  const { text } = buildMomentSourceText({
    title: moment.title,
    description: moment.description,
    usageType: moment.usageType,
    tags: cur.flatMap((c) => c.tags ?? []),
    captions: cur.flatMap((c) => [c.caption, c.useCaseNote, c.relevanceText]),
  });
  const exact = await searchMoments(text, { limit: 1 }, provider);
  assert(exact.length === 1, "exact-text query returns the moment");
  assert(Math.abs(exact[0].score - 1) < 1e-4, `exact-text cosine ≈ 1.0 (${exact[0].score.toFixed(6)})`);
  assert(exact[0].score >= 0 && exact[0].score <= 1, "score is clamped to 0..1");

  console.log("\n[5] budget cap excludes over-price moments:");
  const underCap = await searchMoments(
    text,
    { maxPriceMicroUsdc: moment.priceMicroUsdc - 1 },
    provider,
  );
  assert(underCap.length === 0, `priceCap ${moment.priceMicroUsdc - 1} < price ${moment.priceMicroUsdc} → excluded`);
  const atCap = await searchMoments(
    text,
    { maxPriceMicroUsdc: moment.priceMicroUsdc },
    provider,
  );
  assert(atCap.length === 1, "priceCap == price → included");

  console.log("\n[6] usage-type filter excludes incompatible moments:");
  const wrongUsage = await searchMoments(text, { usageType: "newsletter" }, provider);
  assert(wrongUsage.length === 0, `moment usage '${moment.usageType}' excluded when filtering 'newsletter'`);

  await sql.end();
  console.log("\nSEMANTIC SEARCH PIPELINE OK ✅  (embed → pgvector → idempotent → cosine rank)");
}

main().catch((e) => {
  console.error("\nSEARCH FAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

/**
 * Embedding persistence + semantic query over pgvector.
 *
 *  - `upsertMomentEmbedding` builds the moment's source text, embeds it, and
 *    writes one row per (moment, provider, model) — idempotent on the unique
 *    index; an unchanged source hash skips the (paid) re-embed.
 *  - `searchMoments` embeds the query and ranks ELIGIBLE moments by cosine
 *    distance using the canonical ANN shape (`ORDER BY embedding <=> q ASC`) so
 *    the HNSW index is used, returning a 0..1 similarity score.
 *
 * "Eligible" = an agent could actually license it now: published moment with a
 * hosted clip, ownership verified + attested, and a source that isn't taken
 * down. The pays loop must never settle against an ineligible hit.
 */
import {
  and,
  asc,
  cosineDistance,
  eq,
  gt,
  isNotNull,
  lte,
  notInArray,
  sql,
} from "drizzle-orm";
import { db } from "@/server/db/client";
import { assets, moments, momentEmbeddings, curations } from "@/server/db/schema";
import { TAKEDOWN_ASSET_STATUSES } from "@/server/catalog/licensable";
import {
  EMBEDDING_DIMENSIONS,
  getEmbeddingProvider,
  type EmbeddingProvider,
} from "./index";
import { buildMomentSourceText } from "./source-text";

function assertVector(v: number[] | undefined, dims: number): asserts v is number[] {
  if (!Array.isArray(v) || v.length !== dims) {
    throw new Error(`embedding: expected ${dims}-dim vector, got ${v?.length}`);
  }
  for (const x of v) {
    if (!Number.isFinite(x)) throw new Error("embedding: non-finite value");
  }
}

function assertProviderDims(provider: EmbeddingProvider) {
  if (provider.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `embedding provider ${provider.provider}/${provider.model} has ${provider.dimensions} dims, schema requires ${EMBEDDING_DIMENSIONS}`,
    );
  }
}

export interface UpsertResult {
  momentId: string;
  provider: string;
  model: string;
  status: "embedded" | "unchanged";
  sourceTextHash: string;
}

export async function upsertMomentEmbedding(
  momentId: string,
  provider: EmbeddingProvider = getEmbeddingProvider(),
): Promise<UpsertResult> {
  assertProviderDims(provider);
  const moment = (
    await db.select().from(moments).where(eq(moments.id, momentId))
  )[0];
  if (!moment) throw new Error(`upsertMomentEmbedding: moment ${momentId} not found`);

  // fold in finder curation signal (tags/captions/use-case notes) — DETERMINISTIC
  // ordering so the same set of curations always hashes the same source text.
  const cur = await db
    .select()
    .from(curations)
    .where(eq(curations.momentId, momentId))
    .orderBy(asc(curations.createdAt), asc(curations.id));
  const { text, hash } = buildMomentSourceText({
    title: moment.title,
    description: moment.description,
    usageType: moment.usageType,
    tags: cur.flatMap((c) => c.tags ?? []),
    captions: cur.flatMap((c) => [c.caption, c.useCaseNote, c.relevanceText]),
  });

  const existing = (
    await db
      .select()
      .from(momentEmbeddings)
      .where(
        and(
          eq(momentEmbeddings.momentId, momentId),
          eq(momentEmbeddings.provider, provider.provider),
          eq(momentEmbeddings.model, provider.model),
        ),
      )
  )[0];
  if (existing && existing.sourceTextHash === hash) {
    return { momentId, provider: provider.provider, model: provider.model, status: "unchanged", sourceTextHash: hash };
  }

  const [vector] = await provider.embed([text]);
  assertVector(vector, EMBEDDING_DIMENSIONS);

  await db
    .insert(momentEmbeddings)
    .values({
      momentId,
      provider: provider.provider,
      model: provider.model,
      sourceTextHash: hash,
      sourceText: text,
      embedding: vector,
    })
    .onConflictDoUpdate({
      target: [
        momentEmbeddings.momentId,
        momentEmbeddings.provider,
        momentEmbeddings.model,
      ],
      set: {
        sourceTextHash: hash,
        sourceText: text,
        embedding: vector,
        updatedAt: new Date(),
      },
    });

  await db
    .update(moments)
    .set({ embeddingStatus: "ready", updatedAt: new Date() })
    .where(eq(moments.id, momentId));

  return { momentId, provider: provider.provider, model: provider.model, status: "embedded", sourceTextHash: hash };
}

/**
 * Mark a moment's embedding as failed, so a published-but-not-yet-searchable
 * moment is visible/retryable rather than silently stuck at "pending".
 */
export async function markEmbeddingFailed(momentId: string): Promise<void> {
  await db
    .update(moments)
    .set({ embeddingStatus: "failed", updatedAt: new Date() })
    .where(eq(moments.id, momentId));
}

export interface SearchHit {
  momentId: string;
  assetId: string;
  title: string;
  priceMicroUsdc: number;
  durationMs: number;
  usageType: string;
  /** Cosine similarity clamped to 0..1 (higher = closer). */
  score: number;
}

export interface SearchOptions {
  limit?: number;
  /** Drop hits below this similarity (0..1). */
  minScore?: number;
  /** Only return moments of this usage type. */
  usageType?: string;
  /** Agent budget cap — only return moments at or under this price. */
  maxPriceMicroUsdc?: number;
}

export async function searchMoments(
  query: string,
  opts: SearchOptions = {},
  provider: EmbeddingProvider = getEmbeddingProvider(),
): Promise<SearchHit[]> {
  assertProviderDims(provider);
  const limit = opts.limit ?? 12;
  const [queryVector] = await provider.embed([query]);
  assertVector(queryVector, EMBEDDING_DIMENSIONS);

  // Canonical pgvector ANN shape: ORDER BY distance ASC so HNSW is used.
  const distance = cosineDistance(momentEmbeddings.embedding, queryVector);
  const similarity = sql<number>`1 - (${distance})`;

  const filters = [
    eq(momentEmbeddings.provider, provider.provider),
    eq(momentEmbeddings.model, provider.model),
    // eligibility: agent could actually license this now
    eq(moments.status, "published"),
    isNotNull(moments.clipStorageKey),
    eq(moments.ownershipVerified, true),
    isNotNull(moments.attestationAt),
    notInArray(assets.status, [...TAKEDOWN_ASSET_STATUSES]),
  ];
  if (opts.usageType) {
    filters.push(
      eq(moments.usageType, opts.usageType as (typeof moments.usageType.enumValues)[number]),
    );
  }
  if (opts.maxPriceMicroUsdc != null) {
    filters.push(lte(moments.priceMicroUsdc, opts.maxPriceMicroUsdc));
  }
  if (opts.minScore != null) {
    filters.push(gt(similarity, opts.minScore));
  }

  const rows = await db
    .select({
      momentId: moments.id,
      assetId: moments.assetId,
      title: moments.title,
      priceMicroUsdc: moments.priceMicroUsdc,
      durationMs: moments.durationMs,
      usageType: moments.usageType,
      score: similarity,
    })
    .from(momentEmbeddings)
    .innerJoin(moments, eq(moments.id, momentEmbeddings.momentId))
    .innerJoin(assets, eq(assets.id, moments.assetId))
    .where(and(...filters))
    .orderBy(asc(distance))
    .limit(limit);

  return rows.map((r) => ({
    momentId: r.momentId,
    assetId: r.assetId,
    title: r.title,
    priceMicroUsdc: r.priceMicroUsdc,
    durationMs: r.durationMs,
    usageType: r.usageType,
    score: Math.max(0, Math.min(1, Number(r.score))),
  }));
}

/**
 * MockEmbeddingProvider — deterministic unit vectors (EMBEDDING_DIMENSIONS long)
 * derived from the text. NOT semantic: it proves the pgvector pipeline (persist → HNSW cosine
 * query → rank → idempotency) without an OpenAI key. Identical text yields an
 * identical vector (cosine 1.0); different text yields a different direction.
 */
import { createHash } from "node:crypto";
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "./types";

/** Tiny deterministic PRNG (mulberry32) seeded from the text hash. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embedOne(text: string): number[] {
  const digest = createHash("sha256").update(text).digest();
  const seed = digest.readUInt32LE(0);
  const rand = mulberry32(seed);
  const v = new Array<number>(EMBEDDING_DIMENSIONS);
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    // gaussian-ish via (rand - 0.5) keeps directions well spread
    const x = rand() - 0.5;
    v[i] = x;
    norm += x * x;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) v[i] /= norm;
  return v;
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "mock";
  readonly model = "mock-hash";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(embedOne);
  }
}

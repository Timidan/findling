/**
 * LocalEmbeddingProvider — real semantic embeddings that run fully offline in
 * Node via transformers.js (ONNX). No API key, no network at query time, no
 * rate limits. Model: BAAI's `bge-small-en-v1.5` (384-dim), a strong small
 * retrieval encoder; weights download once from the HF hub and cache to disk.
 *
 * `normalize: true` yields unit vectors, satisfying the schema's cosine==dot
 * contract. The library + its native runtime are heavy, so the pipeline is
 * loaded lazily and reused as a singleton across calls.
 */
import { mkdir } from "node:fs/promises";
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "./types";

type FeatureExtractor = (
  texts: string[],
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

function transformersCacheDir(): string | null {
  return (
    process.env.TRANSFORMERS_CACHE ||
    process.env.FINDLING_TRANSFORMERS_CACHE_DIR ||
    (process.env.NODE_ENV === "production"
      ? "/var/lib/findling/transformers-cache"
      : null)
  );
}

async function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      const cacheDir = transformersCacheDir();
      if (cacheDir) {
        await mkdir(cacheDir, { recursive: true });
        env.cacheDir = cacheDir;
      }
      const pipe = await pipeline(
        "feature-extraction",
        "Xenova/bge-small-en-v1.5",
        { dtype: "q8" },
      );
      return pipe as unknown as FeatureExtractor;
    })();
  }
  return extractorPromise;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "local";
  readonly model = "bge-small-en-v1.5";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await getExtractor();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    const vectors = output.tolist();
    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      throw new Error(
        `Local embeddings: expected ${texts.length} vectors, got ${vectors?.length}`,
      );
    }
    for (const v of vectors) {
      if (!Array.isArray(v) || v.length !== this.dimensions) {
        throw new Error(
          `Local embeddings: expected ${this.dimensions}-dim vectors, got ${v?.length}`,
        );
      }
    }
    return vectors;
  }
}

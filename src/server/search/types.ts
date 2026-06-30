/**
 * Search seam — ONE EmbeddingProvider boundary the catalog/agent talk to.
 *
 * Implementations slot behind this interface:
 *   - LocalEmbeddingProvider (bge-small-en-v1.5 via transformers.js, 384-dim) —
 *     real semantics, fully offline, no API key. The default real embedder.
 *   - GeminiEmbeddingProvider / OpenAIEmbeddingProvider — hosted alternatives
 *     (they request 384 output dims to match the column).
 *   - MockEmbeddingProvider (deterministic hash vectors) — lets the pgvector
 *     persistence + cosine query + ranking run without any model/key.
 *
 * The embedding column is fixed at 384 dims (schema), so every provider here
 * MUST emit 384-dim unit vectors (cosine == dot product).
 */
export const EMBEDDING_DIMENSIONS = 384;

export interface EmbeddingProvider {
  /** Stable provider id stored on the row, e.g. "openai" | "mock". */
  readonly provider: string;
  /** Stable model id stored on the row, e.g. "text-embedding-3-small". */
  readonly model: string;
  /** Vector dimensionality — must equal EMBEDDING_DIMENSIONS. */
  readonly dimensions: number;
  /** Embed a batch of texts; returns one unit vector per input, in order. */
  embed(texts: string[]): Promise<number[][]>;
}

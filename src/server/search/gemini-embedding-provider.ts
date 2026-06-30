/**
 * GeminiEmbeddingProvider — Google's `gemini-embedding-001`, requested at
 * EMBEDDING_DIMENSIONS output dimensions (Matryoshka truncation) to match the
 * pgvector column. A hosted alternative to the local provider; needs a Google
 * AI Studio key (and embeddings access granted on the project).
 *
 * Vectors truncated below the model's native 3072 dims are NOT pre-normalized by
 * the API, so we L2-normalize here to honor the unit-vector contract the schema
 * assumes (cosine == dot product). Raw `fetch`, no SDK dependency — mirrors the
 * OpenAI provider.
 *
 * One `taskType` is used for both documents and queries (the EmbeddingProvider
 * interface has a single `embed()` and the app memoizes one instance, so both
 * sides land in the same space). RETRIEVAL_DOCUMENT is a good general default;
 * asymmetric query/doc task types would need a per-call seam.
 */
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "./types";

const MODEL = "gemini-embedding-001";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;

function l2normalize(v: number[]): number[] {
  let sumSq = 0;
  for (const x of v) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "gemini";
  readonly model = MODEL;
  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(
    private readonly apiKey: string,
    private readonly taskType: string = "RETRIEVAL_DOCUMENT",
  ) {
    if (!apiKey) throw new Error("GeminiEmbeddingProvider: missing API key");
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${MODEL}`,
          content: { parts: [{ text }] },
          taskType: this.taskType,
          outputDimensionality: this.dimensions,
        })),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Gemini embeddings failed: ${res.status} ${body.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as { embeddings?: { values: number[] }[] };
    const embeds = json.embeddings;
    // batchEmbedContents returns embeddings in request order.
    if (!Array.isArray(embeds) || embeds.length !== texts.length) {
      throw new Error(
        `Gemini embeddings: expected ${texts.length} vectors, got ${embeds?.length}`,
      );
    }
    return embeds.map((e) => {
      const v = e?.values;
      if (!Array.isArray(v) || v.length !== this.dimensions) {
        throw new Error(
          `Gemini embeddings: expected ${this.dimensions}-dim vectors, got ${v?.length}`,
        );
      }
      return l2normalize(v);
    });
  }
}

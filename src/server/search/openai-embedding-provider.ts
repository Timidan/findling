/**
 * OpenAIEmbeddingProvider — text-embedding-3-small, requested at
 * EMBEDDING_DIMENSIONS via the `dimensions` param. Uses fetch
 * directly (no SDK dependency) against the embeddings endpoint. OpenAI returns
 * unit-normalized vectors, so cosine == dot product as the schema assumes.
 */
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "./types";

const ENDPOINT = "https://api.openai.com/v1/embeddings";

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "openai";
  readonly model = "text-embedding-3-small";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("OpenAIEmbeddingProvider: missing API key");
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI embeddings failed: ${res.status} ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      data: { index: number; embedding: number[] }[];
    };
    if (!Array.isArray(json.data) || json.data.length !== texts.length) {
      throw new Error(
        `OpenAI embeddings: expected ${texts.length} vectors, got ${json.data?.length}`,
      );
    }
    // Endpoint may not preserve order; sort by index to be safe.
    const vectors = json.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
    for (const v of vectors) {
      if (!Array.isArray(v) || v.length !== this.dimensions) {
        throw new Error(
          `OpenAI embeddings: expected ${this.dimensions}-dim vectors, got ${v?.length}`,
        );
      }
    }
    return vectors;
  }
}

/**
 * Provider selection. EMBEDDING_PROVIDER chooses the embedder. When unset, the
 * first available key wins (openai, then gemini), else "mock" so the pipeline
 * still runs (and is provable) without any key. Set EMBEDDING_PROVIDER=mock to
 * force deterministic vectors even when a key exists (tests/demo).
 *
 * Local (`bge-small-en-v1.5` via transformers.js, offline) is the free default —
 * no key, no billing, runs in-process. Gemini/OpenAI are hosted alternatives
 * that request the configured output dimension (EMBEDDING_DIMENSIONS).
 */
import type { EmbeddingProvider } from "./types";
import { MockEmbeddingProvider } from "./mock-embedding-provider";
import { OpenAIEmbeddingProvider } from "./openai-embedding-provider";
import { GeminiEmbeddingProvider } from "./gemini-embedding-provider";
import { LocalEmbeddingProvider } from "./local-embedding-provider";

export * from "./types";
export { MockEmbeddingProvider } from "./mock-embedding-provider";
export { OpenAIEmbeddingProvider } from "./openai-embedding-provider";
export { GeminiEmbeddingProvider } from "./gemini-embedding-provider";
export { LocalEmbeddingProvider } from "./local-embedding-provider";
export { buildMomentSourceText } from "./source-text";

let cached: EmbeddingProvider | null = null;

/**
 * Fail-closed resolution. The mock embedder is NON-SEMANTIC, so a missing key
 * in production must be a hard error, never a silent downgrade to noise:
 *   - EMBEDDING_PROVIDER=mock      → always allowed (tests/demo)
 *   - EMBEDDING_PROVIDER=openai    → requires OPENAI_API_KEY, else throws
 *   - EMBEDDING_PROVIDER=<other>   → throws (typo guard)
 *   - unset + key present          → openai
 *   - unset + no key + production   → throws (refuse implicit mock)
 *   - unset + no key + dev/test     → mock (local convenience)
 */
function resolve(): EmbeddingProvider {
  const explicit = process.env.EMBEDDING_PROVIDER;
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const isProd = process.env.NODE_ENV === "production";

  if (explicit === "mock") return new MockEmbeddingProvider();
  if (explicit === "local") return new LocalEmbeddingProvider();
  if (explicit === "openai") {
    if (!openaiKey)
      throw new Error("EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is missing.");
    return new OpenAIEmbeddingProvider(openaiKey);
  }
  if (explicit === "gemini") {
    if (!geminiKey)
      throw new Error(
        "EMBEDDING_PROVIDER=gemini but GEMINI_API_KEY (or GOOGLE_API_KEY) is missing.",
      );
    return new GeminiEmbeddingProvider(geminiKey);
  }
  if (explicit) throw new Error(`Unknown EMBEDDING_PROVIDER: ${explicit}`);

  // unset: first available key wins, openai before gemini. LocalEmbeddingProvider
  // is real + offline but downloads a model on first use, so it stays opt-in
  // (EMBEDDING_PROVIDER=local) rather than an implicit surprise.
  if (openaiKey) return new OpenAIEmbeddingProvider(openaiKey);
  if (geminiKey) return new GeminiEmbeddingProvider(geminiKey);
  if (isProd)
    throw new Error(
      "No embedding key and EMBEDDING_PROVIDER unset; refusing implicit mock embeddings in production. Set EMBEDDING_PROVIDER=local (offline, free) or =mock (non-semantic).",
    );
  return new MockEmbeddingProvider();
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cached) cached = resolve();
  return cached;
}

/** Test seam: reset the memoized provider between cases. */
export function __resetEmbeddingProvider() {
  cached = null;
}

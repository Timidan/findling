/**
 * Re-embed every moment with the CONFIGURED provider (getEmbeddingProvider()).
 * Run this after switching EMBEDDING_PROVIDER (e.g. to gemini) so the search
 * filter — which keys on (provider, model) — matches freshly written rows.
 * Idempotent: an unchanged source hash skips the (paid/rate-limited) re-embed.
 *
 *   npx tsx --env-file=.env.local scripts/reembed.ts
 */
import { db } from "../src/server/db/client";
import { moments } from "../src/server/db/schema";
import { getEmbeddingProvider } from "../src/server/search/index";
import { upsertMomentEmbedding } from "../src/server/search/embeddings";

async function main() {
  const provider = getEmbeddingProvider();
  console.log(
    `provider: ${provider.provider}/${provider.model} (${provider.dimensions}d)\n`,
  );

  const all = await db
    .select({ id: moments.id, title: moments.title })
    .from(moments);
  console.log(`re-embedding ${all.length} moment(s)…`);

  let embedded = 0;
  for (const m of all) {
    const r = await upsertMomentEmbedding(m.id, provider);
    if (r.status === "embedded") embedded += 1;
    console.log(`  ${r.status === "embedded" ? "✓" : "·"} ${r.status.padEnd(9)} ${m.title}`);
  }

  console.log(`\ndone — ${embedded} embedded, ${all.length - embedded} unchanged.`);
  process.exit(0); // the shared pool keeps idle handles open; exit cleanly
}

main().catch((e) => {
  console.error("\nFAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

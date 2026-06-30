/**
 * Ad-hoc semantic-search probe against the CONFIGURED provider.
 *   npx tsx --env-file=.env.local scripts/search-query.ts "a query" "another"
 * With no args it contrasts a relevant vs. an irrelevant query so the score gap
 * shows the embeddings are actually semantic.
 */
import { searchMoments } from "../src/server/search/embeddings";
import { getEmbeddingProvider } from "../src/server/search/index";

async function main() {
  const provider = getEmbeddingProvider();
  const args = process.argv.slice(2);
  const queries = args.length
    ? args
    : ["powder snowboard trick in deep snow", "cooking pasta in a kitchen"];

  console.log(
    `provider: ${provider.provider}/${provider.model} (${provider.dimensions}d)\n`,
  );
  for (const q of queries) {
    const hits = await searchMoments(q, { limit: 5 });
    console.log(`query: "${q}"`);
    if (!hits.length) console.log("  (no eligible hits)");
    for (const h of hits) console.log(`  ${h.score.toFixed(4)}  ${h.title}`);
    console.log();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

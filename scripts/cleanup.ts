/**
 * Routine housekeeping — prune the unbounded tables and sweep orphaned upload
 * objects. Touches no money; safe to run on a cron. This is the sweep script
 * docs/RUNBOOK.md §4 references.
 *
 *   node --env-file=.env.local --import tsx scripts/cleanup.ts
 *
 * Exits 0 on success (cron-friendly); a hard failure (e.g. DB unreachable) exits
 * non-zero so the cron surfaces it. Per-object storage errors inside the upload
 * sweep are handled internally and never fail the run.
 */
import {
  deleteExpiredNonces,
  sweepOrphanedUploads,
  sweepStaleRateLimitBuckets,
} from "../src/server/maintenance/cleanup";

async function main() {
  const nonces = await deleteExpiredNonces();
  console.log(`Expired SIWE nonces deleted: ${nonces}`);

  const uploads = await sweepOrphanedUploads();
  console.log(`Orphaned upload intents swept: ${uploads}`);

  const buckets = await sweepStaleRateLimitBuckets();
  console.log(`Stale rate-limit buckets deleted: ${buckets}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

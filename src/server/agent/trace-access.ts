/**
 * Authorization predicate for viewing an agent-run trace, extracted pure so it
 * is unit-testable without a DB.
 *
 * A run with a NULL `buyerId` is an ownerless DEMO run — the public showcase
 * linked from the global nav (`/trace/latest`). A run with a non-null `buyerId`
 * is PRIVATE to that buyer. This mirrors the owner-scoping the API twin already
 * enforces (`/api/agent/runs/[agentRunId]`) so the public page can't leak a
 * buyer's private run (request text, budget, payment reference, …).
 */
export function canViewTrace(
  runBuyerId: string | null,
  viewerUserId: string | null,
): boolean {
  if (runBuyerId === null) return true; // ownerless demo run — public
  return runBuyerId === viewerUserId; // private run — owner only
}

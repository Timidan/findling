/**
 * GET /api/agent/runs/:agentRunId — the agentic decision trace for demo/debug:
 * parsed request, candidates, scores, chosen moment, payment status, receipt.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getAgentRun } from "@/server/agent/agent";
import { getActor } from "@/server/auth/current-user";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ agentRunId: string }> },
) {
  const actor = await getActor(req);
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const limited = await enforceRateLimit("mutation", actor.userId);
  if (limited) return limited;
  const { agentRunId } = await ctx.params;
  // reject non-UUID ids before they reach Postgres (avoids a 22P02 500)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentRunId)) {
    return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  }
  const run = await getAgentRun(agentRunId);
  // own runs only — 404 (not 403) so we don't leak that a run exists
  if (!run || run.buyerId !== actor.userId) {
    return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  }
  return NextResponse.json(run);
}

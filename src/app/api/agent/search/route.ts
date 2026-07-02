/**
 * POST /api/agent/search — REST mirror of the MCP `search_moments` tool.
 * Parses constraints, runs eligible semantic search, records an agent_runs
 * trace, returns ranked candidates + the run id.
 */
import { NextResponse, type NextRequest } from "next/server";
import { runAgentSearch } from "@/server/agent/agent";
import { normalizeAgentSearchCommand } from "@/server/agent/commands";
import { getActor } from "@/server/auth/current-user";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const actor = await getActor(req);
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const limited = await enforceRateLimit("search", actor.userId);
  if (limited) return limited;

  const command = normalizeAgentSearchCommand(await req.json().catch(() => null));
  if (!command.ok) {
    return NextResponse.json({ error: command.error }, { status: command.status });
  }

  // the buyer is the authenticated agent/user — never a body-supplied id
  const result = await runAgentSearch({
    requestText: command.value.query,
    surface: "rest",
    buyerId: actor.userId,
    sessionGrantId: command.value.grantId,
    maxPriceMicroUsdc: command.value.maxPriceMicroUsdc,
    usageType: command.value.usageType,
    limit: command.value.limit,
  });

  return NextResponse.json(result);
}

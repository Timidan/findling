/**
 * GET /api/agent/moments/:momentId — agent-readable moment detail + the x402
 * unlock endpoint the buyer's GatewayClient pays.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getMomentForAgent } from "@/server/agent/agent";
import { getActor } from "@/server/auth/current-user";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ momentId: string }> },
) {
  const actor = await getActor(req);
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { momentId } = await ctx.params;
  if (!UUID.test(momentId)) {
    return NextResponse.json({ error: "moment_not_available" }, { status: 404 });
  }
  const url = new URL(req.url);
  const detail = await getMomentForAgent(momentId, url.origin, {
    grantId: url.searchParams.get("grantId"),
    agentRunId: url.searchParams.get("agentRunId"),
  });
  if (!detail) {
    return NextResponse.json({ error: "moment_not_available" }, { status: 404 });
  }
  return NextResponse.json(detail);
}

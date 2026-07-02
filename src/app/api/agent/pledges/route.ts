/**
 * GET /api/agent/pledges — buyer-agent view of its own claimable pledges.
 * Notified pledges expose the live x402 unlock URL; settled/lapsed/pledged do not.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  listPledges,
  type ListPledgesResult,
} from "../../../../server/claimable/pledges";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";

export const runtime = "nodejs";

interface Actor {
  userId: string;
  via: "session" | "agent";
  roles: string[];
  address: string | null;
}

interface ListDeps {
  list?: (buyerId: string) => Promise<ListPledgesResult>;
}

function isBuyerAgent(actor: Actor | null): actor is Actor {
  return actor?.via === "agent" && actor.roles.includes("buyer");
}

export async function listPledgesResponse(
  actor: Actor | null,
  deps: ListDeps = {},
): Promise<NextResponse> {
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isBuyerAgent(actor)) {
    return NextResponse.json(
      { error: "buyer_agent_required" },
      { status: 403 },
    );
  }

  return NextResponse.json(await (deps.list ?? listPledges)(actor.userId));
}

export async function GET(req: NextRequest) {
  const { getActor } = await import("../../../../server/auth/current-user");
  const actor = await getActor(req);
  if (actor) {
    const limited = await enforceRateLimit("mutation", actor.userId);
    if (limited) return limited;
  }
  return listPledgesResponse(actor);
}

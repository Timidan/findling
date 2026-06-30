/**
 * POST /api/agent/listings/:id/pledge — buyer-agent interest in a claimable
 * listing. This records demand only; it never moves USDC.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  pledgeIntent,
  PledgeValidationError,
  type DemandIntentView,
  type PledgeIntentInput,
} from "../../../../../../server/claimable/pledges";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Actor {
  userId: string;
  via: "session" | "agent";
  roles: string[];
  address: string | null;
}

interface PledgeDeps {
  pledge?: (input: PledgeIntentInput) => Promise<DemandIntentView>;
}

function isBuyerAgent(actor: Actor | null): actor is Actor {
  return actor?.via === "agent" && actor.roles.includes("buyer");
}

function validationStatus(reason: string): number {
  if (reason === "grant_not_owner") return 403;
  if (reason === "listing_not_pledgeable") return 409;
  return 400;
}

function recordBody(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

export async function pledgeListingResponse(
  actor: Actor | null,
  listingId: string,
  body: unknown,
  deps: PledgeDeps = {},
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
  if (!UUID.test(listingId)) {
    return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });
  }

  const payload = recordBody(body);

  try {
    const intent = await (deps.pledge ?? pledgeIntent)({
      buyerId: actor.userId,
      listingId,
      sessionGrantId: payload.sessionGrantId as string,
      budgetMicroUsdc: payload.budgetMicroUsdc as number,
      usageType: payload.usageType as PledgeIntentInput["usageType"],
    });
    return NextResponse.json({ intent }, { status: 201 });
  } catch (e) {
    if (e instanceof PledgeValidationError) {
      return NextResponse.json(
        { error: "invalid_pledge", reason: e.reason },
        { status: validationStatus(e.reason) },
      );
    }
    console.error("[agent/listings/:id/pledge] error:", e);
    return NextResponse.json({ error: "pledge_failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { getActor } = await import("../../../../../../server/auth/current-user");
  const actor = await getActor(req);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  return pledgeListingResponse(actor, id, body);
}

/**
 * POST /api/claim/:token/activate — session-only activation after the creator
 * has uploaded and published a normal licensable moment.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  ClaimValidationError,
  resolveClaimListingBySecret,
} from "../../../../../server/claimable/claim";
import {
  activateListing,
  ActivationValidationError,
  type ActivateListingInput,
  type ActivateListingSummary,
} from "../../../../../server/claimable/activate";
import { enforceRateLimit, clientIp } from "@/server/ratelimit/rate-limit";

export const runtime = "nodejs";

interface Actor {
  userId: string;
  via: "session" | "agent";
  roles: string[];
  address: string | null;
}

interface ResolvedListing {
  id: string;
}

interface ActivateDeps {
  resolve?: (secret: string) => Promise<ResolvedListing>;
  activate?: (input: ActivateListingInput) => Promise<ActivateListingSummary>;
}

function isSessionActor(actor: Actor | null): actor is Actor {
  return actor?.via === "session";
}

function recordBody(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

function claimStatus(reason: string): number {
  if (reason === "invalid_claim_secret") return 404;
  return 400;
}

function activationStatus(reason: string): number {
  if (reason === "not_moment_owner") return 403;
  if (reason === "listing_not_claimed_by_user") return 403;
  if (reason === "moment_not_licensable") return 409;
  return 400;
}

export async function activateClaimResponse(
  actor: Actor | null,
  token: string,
  body: unknown,
  deps: ActivateDeps = {},
): Promise<NextResponse> {
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isSessionActor(actor)) {
    return NextResponse.json(
      { error: "session_required" },
      { status: 403 },
    );
  }

  const payload = recordBody(body);
  if (typeof payload.momentId !== "string" || payload.momentId.length === 0) {
    return NextResponse.json({ error: "invalid_moment_id" }, { status: 400 });
  }

  try {
    const listing = await (deps.resolve ?? resolveClaimListingBySecret)(token);
    const summary = await (deps.activate ?? activateListing)({
      listingId: listing.id,
      userId: actor.userId,
      momentId: payload.momentId,
    });
    return NextResponse.json(summary);
  } catch (e) {
    if (e instanceof ClaimValidationError) {
      return NextResponse.json(
        { error: "invalid_claim", reason: e.reason },
        { status: claimStatus(e.reason) },
      );
    }
    if (e instanceof ActivationValidationError) {
      return NextResponse.json(
        { error: "invalid_activation", reason: e.reason },
        { status: activationStatus(e.reason) },
      );
    }
    console.error("[claim/activate] error:", e);
    return NextResponse.json({ error: "activate_failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const limited = await enforceRateLimit("claim", clientIp(req));
  if (limited) return limited;
  const { getActor } = await import("../../../../../server/auth/current-user");
  const actor = await getActor(req);
  const { token } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return activateClaimResponse(actor, token, body);
}

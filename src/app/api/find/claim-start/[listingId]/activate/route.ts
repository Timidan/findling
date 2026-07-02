/**
 * POST /api/find/claim-start/:listingId/activate — activate a listing the caller has
 * already claimed (by id): links their published moment, mints the finder curation,
 * and notifies the pledged agents. Session-only. `activateListing` enforces that the
 * caller owns both the listing (claimedByUserId) and the moment (creatorId).
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  activateListing,
  ActivationValidationError,
  type ActivateListingInput,
  type ActivateListingSummary,
} from "@/server/claimable/activate";
import { enforceRateLimit, clientIp } from "@/server/ratelimit/rate-limit";
import { isSameOrigin } from "@/server/auth/csrf";

export const runtime = "nodejs";

interface Actor {
  userId: string;
  via: "session" | "agent";
  roles: string[];
  address: string | null;
}

interface ActivateDeps {
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

function activationStatus(reason: string): number {
  if (reason === "not_moment_owner") return 403;
  if (reason === "listing_not_claimed_by_user") return 403;
  if (reason === "moment_not_licensable") return 409;
  return 400;
}

export async function activateStartResponse(
  actor: Actor | null,
  listingId: string,
  body: unknown,
  deps: ActivateDeps = {},
): Promise<NextResponse> {
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isSessionActor(actor)) {
    return NextResponse.json({ error: "session_required" }, { status: 403 });
  }

  const payload = recordBody(body);
  if (typeof payload.momentId !== "string" || payload.momentId.length === 0) {
    return NextResponse.json({ error: "invalid_moment_id" }, { status: 400 });
  }

  try {
    const summary = await (deps.activate ?? activateListing)({
      listingId,
      userId: actor.userId,
      momentId: payload.momentId,
    });
    return NextResponse.json(summary);
  } catch (e) {
    if (e instanceof ActivationValidationError) {
      return NextResponse.json(
        { error: "invalid_activation", reason: e.reason },
        { status: activationStatus(e.reason) },
      );
    }
    console.error("[find/claim-start/activate] error:", e);
    return NextResponse.json({ error: "activate_failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ listingId: string }> },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  const { getActor } = await import("@/server/auth/current-user");
  const actor = await getActor(req);
  const limited = await enforceRateLimit("mutation", actor?.userId ?? clientIp(req));
  if (limited) return limited;
  const { listingId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return activateStartResponse(actor, listingId, body);
}

/**
 * POST /api/find/claim-start/:listingId/claim — claim a Wanted listing by its public
 * id (the discovery-hub claim-start path; no secret). Human SIWE session only.
 *
 * Only actor-control listings can be claimed this way — `claimListingByListing`
 * gates that, requiring a posted channel-control proof. url/youtube listings must
 * still use their unguessable claim link.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  claimListingByListing,
  ClaimValidationError,
  type ClaimListingByListingInput,
  type ClaimListingResult,
} from "@/server/claimable/claim";
import { verifyPeerTubeActorProof } from "@/server/claimable/peertube-proof";

export const runtime = "nodejs";

interface Actor {
  userId: string;
  via: "session" | "agent";
  roles: string[];
  address: string | null;
}

interface ClaimDeps {
  claim?: (input: ClaimListingByListingInput) => Promise<ClaimListingResult>;
  proofVerifier?: ClaimListingByListingInput["proofVerifier"];
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
  if (reason === "listing_not_found") return 404;
  if (reason === "claim_requires_secret") return 403;
  if (reason === "finder_cannot_claim_own_listing") return 403;
  if (reason === "actor_proof_required" || reason === "actor_proof_failed") return 403;
  if (reason === "listing_not_claimable") return 409;
  return 400;
}

export async function claimStartResponse(
  actor: Actor | null,
  listingId: string,
  body: unknown,
  deps: ClaimDeps = {},
): Promise<NextResponse> {
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isSessionActor(actor)) {
    return NextResponse.json({ error: "session_required" }, { status: 403 });
  }

  const payload = recordBody(body);
  try {
    const result = await (deps.claim ?? claimListingByListing)({
      listingId,
      userId: actor.userId,
      proof: payload.proof,
      proofVerifier: deps.proofVerifier ?? verifyPeerTubeActorProof,
    });
    return NextResponse.json({ listingId: result.listing.id });
  } catch (e) {
    if (e instanceof ClaimValidationError) {
      return NextResponse.json(
        { error: "invalid_claim", reason: e.reason },
        { status: claimStatus(e.reason) },
      );
    }
    console.error("[find/claim-start] claim error:", e);
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ listingId: string }> },
) {
  const { getActor } = await import("@/server/auth/current-user");
  const actor = await getActor(req);
  const { listingId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return claimStartResponse(actor, listingId, body);
}

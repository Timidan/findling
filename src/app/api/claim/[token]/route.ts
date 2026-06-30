/**
 * Claim session surface.
 *
 * GET is public for rendering the claim page. POST requires a human SIWE
 * session; bearer-agent auth is intentionally rejected for creator claims.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  claimListing,
  ClaimValidationError,
  getClaimSession,
  type ClaimListingInput,
  type ClaimListingResult,
  type PublicClaimSession,
} from "../../../../server/claimable/claim";
import { verifyPeerTubeActorProof } from "../../../../server/claimable/peertube-proof";

export const runtime = "nodejs";

interface Actor {
  userId: string;
  via: "session" | "agent";
  roles: string[];
  address: string | null;
}

interface GetDeps {
  get?: (secret: string) => Promise<PublicClaimSession>;
}

interface ClaimDeps {
  claim?: (input: ClaimListingInput) => Promise<ClaimListingResult>;
  proofVerifier?: ClaimListingInput["proofVerifier"];
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
  if (reason === "finder_cannot_claim_own_listing") return 403;
  if (reason === "actor_proof_required") return 403;
  if (reason === "actor_proof_failed") return 403;
  if (reason === "listing_not_claimable") return 409;
  return 400;
}

export async function getClaimSessionResponse(
  token: string,
  deps: GetDeps = {},
): Promise<NextResponse> {
  try {
    return NextResponse.json(await (deps.get ?? getClaimSession)(token));
  } catch (e) {
    if (e instanceof ClaimValidationError) {
      return NextResponse.json(
        { error: "invalid_claim", reason: e.reason },
        { status: claimStatus(e.reason) },
      );
    }
    console.error("[claim] get session error:", e);
    return NextResponse.json({ error: "claim_lookup_failed" }, { status: 500 });
  }
}

export async function claimSessionResponse(
  actor: Actor | null,
  token: string,
  body: unknown,
  deps: ClaimDeps = {},
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
  try {
    const result = await (deps.claim ?? claimListing)({
      secret: token,
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
    console.error("[claim] claim error:", e);
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  return getClaimSessionResponse(token);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { getActor } = await import("../../../../server/auth/current-user");
  const actor = await getActor(req);
  const { token } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return claimSessionResponse(actor, token, body);
}

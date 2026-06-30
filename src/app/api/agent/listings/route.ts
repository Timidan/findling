/**
 * Claimable listings agent surface.
 *
 * Bearer-agent only:
 * - POST requires a finder agent and returns the one-time claim URL.
 * - GET is the authenticated agent demand feed for buyer or finder agents.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  claimUrlForSecret,
  createListing,
  listListings,
  ListingConflictError,
  ListingValidationError,
  type CreateListingResult,
  type ListListingsResult,
} from "../../../../server/claimable/listings";

export const runtime = "nodejs";

interface Actor {
  userId: string;
  via: "session" | "agent";
  roles: string[];
  address: string | null;
}

interface CreateDeps {
  create?: (finderId: string, input: unknown) => Promise<CreateListingResult>;
}

interface ListDeps {
  list?: (input: { audience: "agent" }) => Promise<ListListingsResult>;
}

function isAgent(actor: Actor | null): actor is Actor {
  return actor?.via === "agent";
}

export async function createListingResponse(
  actor: Actor | null,
  body: unknown,
  baseUrl: string,
  deps: CreateDeps = {},
): Promise<NextResponse> {
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isAgent(actor) || !actor.roles.includes("finder")) {
    return NextResponse.json(
      { error: "finder_agent_required" },
      { status: 403 },
    );
  }

  try {
    const created = await (deps.create ?? createListing)(actor.userId, body);
    return NextResponse.json(
      {
        listing: created.listing,
        claimUrl: claimUrlForSecret(baseUrl, created.claimSecret),
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ListingValidationError) {
      return NextResponse.json(
        { error: "invalid_listing", reason: e.reason },
        { status: 400 },
      );
    }
    if (e instanceof ListingConflictError) {
      return NextResponse.json(
        { error: "listing_conflict", reason: e.reason },
        { status: 409 },
      );
    }
    console.error("[agent/listings] create error:", e);
    return NextResponse.json({ error: "create_listing_failed" }, { status: 500 });
  }
}

export async function listListingsResponse(
  actor: Actor | null,
  deps: ListDeps = {},
): Promise<NextResponse> {
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isAgent(actor)) {
    return NextResponse.json({ error: "agent_required" }, { status: 403 });
  }
  return NextResponse.json(
    await (deps.list ?? listListings)({ audience: "agent" }),
  );
}

export async function POST(req: NextRequest) {
  const { getActor } = await import("../../../../server/auth/current-user");
  const actor = await getActor(req);
  const body = await req.json().catch(() => null);
  return createListingResponse(actor, body, new URL(req.url).origin);
}

export async function GET(req: NextRequest) {
  const { getActor } = await import("../../../../server/auth/current-user");
  const actor = await getActor(req);
  return listListingsResponse(actor);
}

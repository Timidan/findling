/**
 * Human request surface.
 *
 * Signed-in users can request a video clip that is not available yet. The row is
 * stored as a claimable listing, then a creator can claim it and upload the clip.
 */
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/server/auth/csrf";
import type { Actor } from "@/server/auth/current-user";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";
import {
  claimUrlForSecret,
  createListing,
  ListingConflictError,
  ListingValidationError,
  type CreateListingResult,
} from "@/server/claimable/listings";

export const runtime = "nodejs";

interface CreateDeps {
  create?: (userId: string, input: unknown) => Promise<CreateListingResult>;
  revalidate?: (tag: string) => void;
}

function statusForListingError(e: unknown): NextResponse | null {
  if (e instanceof ListingValidationError) {
    return NextResponse.json(
      { error: "invalid_request", reason: e.reason },
      { status: 400 },
    );
  }
  if (e instanceof ListingConflictError) {
    return NextResponse.json(
      { error: "request_conflict", reason: e.reason },
      { status: 409 },
    );
  }
  return null;
}

export async function createFindRequestResponse(
  actor: Actor | null,
  body: unknown,
  baseUrl: string,
  deps: CreateDeps = {},
): Promise<NextResponse> {
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (actor.via !== "session") {
    return NextResponse.json({ error: "session_required" }, { status: 403 });
  }

  try {
    const created = await (deps.create ?? createListing)(actor.userId, body);
    (deps.revalidate ?? ((tag: string) => revalidateTag(tag, "max")))(
      "find-feed",
    );
    return NextResponse.json(
      {
        listing: created.listing,
        claimUrl: claimUrlForSecret(baseUrl, created.claimSecret),
      },
      { status: 201 },
    );
  } catch (e) {
    const handled = statusForListingError(e);
    if (handled) return handled;
    console.error("[find/requests] create error:", e);
    return NextResponse.json({ error: "create_request_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }

  const { getActor } = await import("@/server/auth/current-user");
  const actor = await getActor(req);
  if (actor) {
    const limited = await enforceRateLimit("mutation", actor.userId);
    if (limited) return limited;
  }

  const body = await req.json().catch(() => null);
  return createFindRequestResponse(actor, body, new URL(req.url).origin);
}

/**
 * PATCH /api/creator/moments/{momentId}/price — set a moment's price (owner-only).
 * Price is integer micro-USDC (1 USDC = 1_000_000). Bounded to $0.001 … $100.
 */
import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireUserId, UnauthenticatedError } from "@/server/auth/current-user";
import { isSameOrigin } from "@/server/auth/csrf";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";
import {
  setMomentPrice,
  MIN_PRICE_MICRO_USDC,
  MAX_PRICE_MICRO_USDC,
} from "@/server/catalog/catalog";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ momentId: string }> },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }

  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    throw e;
  }

  const limited = await enforceRateLimit("mutation", userId);
  if (limited) return limited;

  const { momentId } = await ctx.params;
  if (!UUID.test(momentId)) {
    return NextResponse.json({ error: "invalid_moment_id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { priceMicroUsdc?: number } | null;
  const price = body?.priceMicroUsdc;
  if (
    typeof price !== "number" ||
    !Number.isInteger(price) ||
    price < MIN_PRICE_MICRO_USDC ||
    price > MAX_PRICE_MICRO_USDC
  ) {
    return NextResponse.json(
      {
        error: "invalid_price",
        hint: `priceMicroUsdc must be an integer between ${MIN_PRICE_MICRO_USDC} and ${MAX_PRICE_MICRO_USDC}`,
      },
      { status: 400 },
    );
  }

  const moment = await setMomentPrice({ creatorId: userId, momentId, priceMicroUsdc: price });
  if (!moment) {
    return NextResponse.json({ error: "moment_not_found" }, { status: 404 });
  }

  revalidateTag("studio-catalog", "max");
  if (moment.status === "published") revalidateTag("find-feed", "max");

  return NextResponse.json({
    ok: true,
    priceMicroUsdc: moment.priceMicroUsdc,
    priceUsdSnapshot: moment.priceUsdSnapshot,
  });
}

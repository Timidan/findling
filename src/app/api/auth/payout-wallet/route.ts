import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { requireUserId, UnauthenticatedError } from "@/server/auth/current-user";
import { isSameOrigin } from "@/server/auth/csrf";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";

export const dynamic = "force-dynamic";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

// Set the signed-in user's on-chain payout wallet (where withdrawals settle).
export async function POST(req: NextRequest) {
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

  // TODO(security): require a fresh signed proof-of-control of the new payout wallet (step-up)
  const body = (await req.json().catch(() => null)) as { address?: string } | null;
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  if (!ADDR_RE.test(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ payoutWalletAddress: address, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return NextResponse.json({ ok: true, payoutWalletAddress: address });
}

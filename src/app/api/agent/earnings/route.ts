/**
 * GET /api/agent/earnings — the AUTHENTICATED caller's accrued / withdrawn /
 * withdrawable balance (creator and/or finder). You can only read your own.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getEarnings } from "@/server/ledger/earnings";
import { getActor } from "@/server/auth/current-user";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const actor = await getActor(req);
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const limited = await enforceRateLimit("mutation", actor.userId);
  if (limited) return limited;
  const earnings = await getEarnings(actor.userId);
  return NextResponse.json(earnings);
}

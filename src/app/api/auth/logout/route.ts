import { NextResponse, type NextRequest } from "next/server";
import { clearSession } from "@/server/auth/session";
import { getCurrentUserId } from "@/server/auth/current-user";
import { isSameOrigin } from "@/server/auth/csrf";
import { enforceRateLimit, clientIp } from "@/server/ratelimit/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  const userId = await getCurrentUserId();
  const limited = await enforceRateLimit("mutation", userId ?? clientIp(req));
  if (limited) return limited;
  await clearSession();
  return NextResponse.json({ ok: true });
}

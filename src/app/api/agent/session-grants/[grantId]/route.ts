/**
 * DELETE /api/agent/session-grants/{grantId} — revoke a session grant (owner-only).
 * Revoking stops future spend; it never touches already-settled purchases.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/current-user";
import { isSameOrigin } from "@/server/auth/csrf";
import { revokeGrant, grantView } from "@/server/grants/grants";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ grantId: string }> },
) {
  // Cookie-authed browser mutation (also accepts an agent bearer, which sends no
  // Origin) — reject a cross-origin browser POST as CSRF defense-in-depth.
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  const actor = await getActor(req);
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const limited = await enforceRateLimit("mutation", actor.userId);
  if (limited) return limited;
  const { grantId } = await ctx.params;
  if (!UUID.test(grantId)) {
    return NextResponse.json({ error: "invalid_grant_id" }, { status: 400 });
  }
  const grant = await revokeGrant(actor.userId, grantId);
  if (!grant) {
    return NextResponse.json({ error: "grant_not_found" }, { status: 404 });
  }
  return NextResponse.json({ grant: grantView(grant) });
}

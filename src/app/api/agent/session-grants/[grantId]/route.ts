/**
 * DELETE /api/agent/session-grants/{grantId} — revoke a session grant (owner-only).
 * Revoking stops future spend; it never touches already-settled purchases.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/current-user";
import { revokeGrant, grantView } from "@/server/grants/grants";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ grantId: string }> },
) {
  const actor = await getActor(req);
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
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

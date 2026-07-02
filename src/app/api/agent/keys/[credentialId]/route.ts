/**
 * DELETE /api/agent/keys/{credentialId} — revoke a credential (owner-only, human session).
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUserId } from "@/server/auth/current-user";
import { isSameOrigin } from "@/server/auth/csrf";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";
import { db } from "@/server/db/client";
import { agentCredentials } from "@/server/db/schema";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ credentialId: string }> },
) {
  // Cookie-authed browser mutation — reject cross-origin (CSRF defense-in-depth),
  // matching every other cookie-authed mutation (incl. the sibling POST).
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const limited = await enforceRateLimit("mutation", userId);
  if (limited) return limited;
  const { credentialId } = await ctx.params;
  if (!UUID.test(credentialId)) {
    return NextResponse.json({ error: "invalid_credential_id" }, { status: 400 });
  }
  const rows = await db
    .update(agentCredentials)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(agentCredentials.id, credentialId),
        eq(agentCredentials.userId, userId),
      ),
    )
    .returning({ id: agentCredentials.id });
  if (!rows.length) {
    return NextResponse.json({ error: "credential_not_found" }, { status: 404 });
  }
  return NextResponse.json({ revoked: true });
}

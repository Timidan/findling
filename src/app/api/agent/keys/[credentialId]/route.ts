/**
 * DELETE /api/agent/keys/{credentialId} — revoke a credential (owner-only, human session).
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { agentCredentials } from "@/server/db/schema";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ credentialId: string }> },
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
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

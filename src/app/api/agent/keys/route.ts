/**
 * Human-session agent key management.
 *   GET  /api/agent/keys → list this user's credentials (no plaintext)
 *   POST /api/agent/keys → issue a new key; returns plaintext ONCE
 *
 * Scoped to the signed-in human session only — agent bearer keys are NOT accepted
 * here so autonomous agents can't mint new keys for themselves via this surface.
 * The headless agent auth flow (SIWE → key) lives at /api/agent/auth.
 */
import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getCurrentUserId } from "@/server/auth/current-user";
import { issueAgentKey } from "@/server/auth/agent-credential";
import { db } from "@/server/db/client";
import { agentCredentials } from "@/server/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const creds = await db
    .select({
      id: agentCredentials.id,
      label: agentCredentials.label,
      lastUsedAt: agentCredentials.lastUsedAt,
      expiresAt: agentCredentials.expiresAt,
      revokedAt: agentCredentials.revokedAt,
      createdAt: agentCredentials.createdAt,
    })
    .from(agentCredentials)
    .where(eq(agentCredentials.userId, userId))
    .orderBy(desc(agentCredentials.createdAt));
  return NextResponse.json({ credentials: creds });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { label?: string } | null;
  const label = typeof body?.label === "string" && body.label.trim() ? body.label.trim() : undefined;
  const key = await issueAgentKey(userId, label);
  return NextResponse.json({ key }, { status: 201 });
}

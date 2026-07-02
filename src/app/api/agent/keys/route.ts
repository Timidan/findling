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
import { isSameOrigin } from "@/server/auth/csrf";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";
import { issueAgentKey, activeAgentKeyCount } from "@/server/auth/agent-credential";
import { db } from "@/server/db/client";
import { agentCredentials } from "@/server/db/schema";

export const runtime = "nodejs";

/** Max live (non-revoked, unexpired) agent keys one account may hold. */
const MAX_ACTIVE_AGENT_KEYS = 10;

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
  // Cookie-authed from Studio — reject cross-origin (CSRF defense-in-depth).
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const limited = await enforceRateLimit("keyCreate", userId);
  if (limited) return limited;

  // Quota: cap live keys per account so one user can't accrue unbounded secrets.
  if ((await activeAgentKeyCount(userId)) >= MAX_ACTIVE_AGENT_KEYS) {
    return NextResponse.json({ error: "key_quota_exceeded" }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as { label?: string } | null;
  const label = typeof body?.label === "string" && body.label.trim() ? body.label.trim() : undefined;
  const key = await issueAgentKey(userId, label);
  return NextResponse.json({ key }, { status: 201 });
}

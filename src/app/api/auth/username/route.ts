import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { requireUserId, UnauthenticatedError } from "@/server/auth/current-user";
import { isSameOrigin } from "@/server/auth/csrf";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";

export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

// Set the signed-in user's unique handle (lowercased, 3-20 [a-z0-9_]).
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

  const body = (await req.json().catch(() => null)) as { username?: string } | null;
  const username =
    typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "invalid_username", hint: "3–20 characters: a–z, 0–9, underscore" },
      { status: 400 },
    );
  }

  const taken = (
    await db.select({ id: users.id }).from(users).where(eq(users.username, username))
  )[0];
  if (taken && taken.id !== userId) {
    return NextResponse.json({ error: "username_taken" }, { status: 409 });
  }

  await db
    .update(users)
    .set({ username, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return NextResponse.json({ ok: true, username });
}

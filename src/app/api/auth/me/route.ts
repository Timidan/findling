import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";

export const dynamic = "force-dynamic";

// The currently-signed-in human (wallet session), or { user: null }.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  const user = (
    await db
      .select({
        id: users.id,
        address: users.walletAddress,
        username: users.username,
        displayName: users.displayName,
        roles: users.roles,
        payoutWalletAddress: users.payoutWalletAddress,
      })
      .from(users)
      .where(eq(users.id, session.uid))
  )[0];
  return NextResponse.json({ user: user ?? null });
}

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { refreshAccessToken } from "@/server/youtube/oauth";
import { getMyChannel, listUploads } from "@/server/youtube/api";
import { tokenCipher } from "@/server/crypto/token-crypto";

export const runtime = "nodejs";

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const user = (await db.select().from(users).where(eq(users.id, userId)))[0];
  if (!user?.youtubeRefreshTokenCiphertext) {
    return NextResponse.json(
      { error: "Connect your YouTube channel first." },
      { status: 400 },
    );
  }

  try {
    const refresh = tokenCipher().decrypt(user.youtubeRefreshTokenCiphertext);
    const accessToken = await refreshAccessToken(refresh);
    const channel = await getMyChannel(accessToken);
    const videos = await listUploads(accessToken, channel.uploadsPlaylistId);
    return NextResponse.json({ channel, videos });
  } catch {
    return NextResponse.json(
      { error: "Could not load your YouTube videos." },
      { status: 502 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import {
  exchangeCode,
  verifyYoutubeOAuthState,
  YOUTUBE_OAUTH_STATE_COOKIE,
} from "@/server/youtube/oauth";
import { getMyChannel } from "@/server/youtube/api";
import { tokenCipher } from "@/server/crypto/token-crypto";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = verifyYoutubeOAuthState(
    url.searchParams.get("state"),
    req.cookies.get(YOUTUBE_OAUTH_STATE_COOKIE)?.value,
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://findling.timidan.xyz";

  if (!code || !state) {
    const res = NextResponse.redirect(`${appUrl}/?youtube=error`);
    res.cookies.delete(YOUTUBE_OAUTH_STATE_COOKIE);
    return res;
  }

  try {
    const tokens = await exchangeCode(code);
    const channel = await getMyChannel(tokens.access_token);
    const enc = tokens.refresh_token
      ? tokenCipher().encrypt(tokens.refresh_token)
      : null;

    await db
      .update(users)
      .set({
        youtubeChannelId: channel.channelId,
        youtubeChannelTitle: channel.title,
        ...(enc ? { youtubeRefreshTokenCiphertext: enc } : {}),
        youtubeConnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, state.userId));

    const res = NextResponse.redirect(`${appUrl}/?youtube=connected`);
    res.cookies.delete(YOUTUBE_OAUTH_STATE_COOKIE);
    return res;
  } catch {
    const res = NextResponse.redirect(`${appUrl}/?youtube=error`);
    res.cookies.delete(YOUTUBE_OAUTH_STATE_COOKIE);
    return res;
  }
}

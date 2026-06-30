import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth/current-user";
import {
  buildAuthUrl,
  issueYoutubeOAuthState,
  YOUTUBE_OAUTH_STATE_COOKIE,
  YOUTUBE_OAUTH_STATE_MAX_AGE_SECONDS,
} from "@/server/youtube/oauth";

export const runtime = "nodejs";

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const state = issueYoutubeOAuthState(userId);
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set(YOUTUBE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: YOUTUBE_OAUTH_STATE_MAX_AGE_SECONDS,
  });
  return res;
}

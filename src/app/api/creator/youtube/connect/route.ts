import { NextResponse, type NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/current-user";
import { isSameOrigin } from "@/server/auth/csrf";
import {
  buildAuthUrl,
  issueYoutubeOAuthState,
  YOUTUBE_OAUTH_STATE_COOKIE,
  YOUTUBE_OAUTH_STATE_MAX_AGE_SECONDS,
} from "@/server/youtube/oauth";

export const runtime = "nodejs";

function cleanOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function forwardedValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function publicOrigin(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return cleanOrigin(process.env.NEXT_PUBLIC_APP_URL);
  }

  const host =
    forwardedValue(req.headers.get("x-forwarded-host")) ??
    forwardedValue(req.headers.get("host"));
  if (!host) return new URL(req.url).origin;

  const proto =
    forwardedValue(req.headers.get("x-forwarded-proto")) ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");

  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    // This endpoint is reached by a top-level browser navigation (a link/button),
    // so a signed-out or expired session must NOT dump raw JSON onto a blank page.
    // Send the user to a real page (which shows the connect gate) instead of a
    // dead end.
    return NextResponse.redirect(new URL("/studio/settings", publicOrigin(req)));
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

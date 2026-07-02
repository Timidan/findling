import { NextResponse, type NextRequest } from "next/server";
import { issueNonce, NONCE_COOKIE, NONCE_TTL_SECONDS } from "@/server/auth/siwe";
import { enforceRateLimit, clientIp } from "@/server/ratelimit/rate-limit";

export const dynamic = "force-dynamic";

// Issue a single-use SIWE nonce AND bind it to an httpOnly cookie. Verification
// requires the signed message's nonce to match this cookie, so a captured
// message+signature can't be redeemed from a different client.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit("nonce", clientIp(req));
  if (limited) return limited;
  const nonce = await issueNonce();
  const res = NextResponse.json({ nonce });
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: NONCE_TTL_SECONDS,
  });
  return res;
}

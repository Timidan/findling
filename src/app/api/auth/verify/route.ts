import { NextResponse, type NextRequest } from "next/server";
import {
  verifySiwe,
  upsertUserByWallet,
  resolveAuthDomain,
  SiweError,
  NONCE_COOKIE,
} from "@/server/auth/siwe";
import { setSession } from "@/server/auth/session";
import { enforceRateLimit, clientIp } from "@/server/ratelimit/rate-limit";

export const dynamic = "force-dynamic";

// Human login: verify the SIWE message + signature, find/create the user by
// wallet, and set the session cookie.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    message?: string;
    signature?: string;
  } | null;
  if (typeof body?.message !== "string" || typeof body?.signature !== "string") {
    return NextResponse.json(
      { error: "message and signature (strings) are required" },
      { status: 400 },
    );
  }
  const limited = await enforceRateLimit("authVerify", clientIp(req));
  if (limited) return limited;
  const domain = resolveAuthDomain(req.headers.get("host"));
  const boundNonce = req.cookies.get(NONCE_COOKIE)?.value ?? null;
  try {
    const { address } = await verifySiwe(
      body.message,
      body.signature as `0x${string}`,
      domain,
      boundNonce,
    );
    const user = await upsertUserByWallet(address);
    await setSession(user.id, address);
    return NextResponse.json({
      ok: true,
      userId: user.id,
      address,
      created: user.created,
    });
  } catch (e) {
    if (e instanceof SiweError) {
      return NextResponse.json(
        { error: "siwe_verification_failed", reason: e.message },
        { status: 401 },
      );
    }
    console.error("[auth/verify] error:", e);
    return NextResponse.json({ error: "verify_error" }, { status: 500 });
  }
}

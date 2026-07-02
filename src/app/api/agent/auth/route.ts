import { NextResponse, type NextRequest } from "next/server";
import {
  verifySiwe,
  upsertUserByWallet,
  resolveAuthDomain,
  SiweError,
  NONCE_COOKIE,
} from "@/server/auth/siwe";
import { issueAgentKey } from "@/server/auth/agent-credential";
import { enforceRateLimit, clientIp } from "@/server/ratelimit/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Headless agent onboarding. The agent fetches a nonce (GET /api/auth/nonce,
 * keeping the cookie), signs a SIWE message with its wallet, and POSTs it here.
 * On success it receives a one-time bearer key for the agent API + MCP.
 * New agent wallets are provisioned with the finder + buyer roles.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    message?: string;
    signature?: string;
    label?: string;
  } | null;
  if (typeof body?.message !== "string" || typeof body?.signature !== "string") {
    return NextResponse.json(
      { error: "message and signature (strings) are required" },
      { status: 400 },
    );
  }
  const limited = await enforceRateLimit("agentAuth", clientIp(req));
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
    const user = await upsertUserByWallet(address, ["finder", "buyer"]);
    const apiKey = await issueAgentKey(user.id, body.label);
    return NextResponse.json({
      ok: true,
      apiKey,
      userId: user.id,
      address,
      usage: "Send `Authorization: Bearer <apiKey>` on the Findling agent REST API and pass it to the MCP server as FINDLING_AGENT_KEY.",
    });
  } catch (e) {
    if (e instanceof SiweError) {
      return NextResponse.json(
        { error: "siwe_verification_failed", reason: e.message },
        { status: 401 },
      );
    }
    console.error("[agent/auth] error:", e);
    return NextResponse.json({ error: "register_error" }, { status: 500 });
  }
}

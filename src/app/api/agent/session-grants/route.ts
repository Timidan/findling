/**
 * Buyer session grants — self-serve spending authorization for agent buyers.
 *   POST /api/agent/session-grants  → create a funded-delegate grant (caps + key)
 *   GET  /api/agent/session-grants  → list the caller's grants
 * Authenticated as the buyer (agent bearer key or human session). The created
 * grantId is what the agent passes to the x402 unlock route.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/current-user";
import {
  createGrant,
  listGrants,
  grantView,
  GrantValidationError,
} from "@/server/grants/grants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const actor = await getActor(req);
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    sessionKeyAddress?: string;
    totalCapMicroUsdc?: number;
    perPurchaseCapMicroUsdc?: number | null;
    expiresInSeconds?: number | null;
    allowedUsageTypes?: string[] | null;
  } | null;
  if (!body || typeof body.sessionKeyAddress !== "string" || typeof body.totalCapMicroUsdc !== "number") {
    return NextResponse.json(
      { error: "sessionKeyAddress (string) and totalCapMicroUsdc (number) are required" },
      { status: 400 },
    );
  }

  try {
    const grant = await createGrant({
      buyerId: actor.userId,
      sessionKeyAddress: body.sessionKeyAddress,
      totalCapMicroUsdc: body.totalCapMicroUsdc,
      perPurchaseCapMicroUsdc: body.perPurchaseCapMicroUsdc ?? null,
      expiresInSeconds: body.expiresInSeconds ?? null,
      allowedUsageTypes: body.allowedUsageTypes ?? null,
    });
    return NextResponse.json({ grant: grantView(grant) }, { status: 201 });
  } catch (e) {
    if (e instanceof GrantValidationError) {
      return NextResponse.json({ error: "invalid_grant", reason: e.reason }, { status: 400 });
    }
    console.error("[agent/session-grants] create error:", e);
    return NextResponse.json({ error: "create_error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const actor = await getActor(req);
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const grants = await listGrants(actor.userId);
  return NextResponse.json({ grants: grants.map(grantView) });
}

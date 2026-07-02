/**
 * Protected x402 seller unlock route (Arc testnet, Circle Gateway batched).
 *
 * HTTP stays here; License Purchase ordering lives in
 * `src/server/license-purchase/license-purchase.ts`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { runLicensePurchase } from "@/server/license-purchase/license-purchase";
import { getGatewayProvider } from "@/server/payment";
import { isUuid } from "@/server/http/uuid";

export const runtime = "nodejs";

function json(body: unknown, status: number, headers?: Record<string, string>) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ momentId: string }> },
) {
  const { momentId } = await ctx.params;
  if (!isUuid(momentId)) return json({ error: "moment_not_available" }, 404);
  const url = new URL(req.url);
  const result = await runLicensePurchase({
    momentId,
    grantId: url.searchParams.get("grantId"),
    agentRunId: url.searchParams.get("agentRunId"),
    origin: url.origin,
    pathname: url.pathname,
    paymentHeader: req.headers.get("Payment-Signature"),
    paymentProvider: getGatewayProvider(),
    sellerAddress: process.env.SELLER_ADDRESS!,
  });

  return json(result.body, result.status, result.headers);
}

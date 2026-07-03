import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

export const dynamic = "force-dynamic";

const GATEWAY_API_TESTNET = "https://gateway-api-testnet.circle.com/v1";
const ARC_TESTNET_GATEWAY_DOMAIN = 26;

function decimalUsdcToMicroString(value: unknown): string {
  const raw = typeof value === "string" ? value : String(value ?? "0");
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error("invalid_gateway_balance");
  const [whole, fraction = ""] = raw.split(".");
  const micros =
    BigInt(whole) * BigInt(1_000_000) +
    BigInt((fraction + "000000").slice(0, 6));
  return micros.toString();
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  const upstream = await fetch(`${GATEWAY_API_TESTNET}/balances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: "USDC",
      sources: [{ depositor: address, domain: ARC_TESTNET_GATEWAY_DOMAIN }],
    }),
  });

  const data = (await upstream.json()) as {
    balances?: Array<{
      balance?: unknown;
      withdrawing?: unknown;
      withdrawable?: unknown;
    }>;
    message?: string;
  };

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "gateway_balance_unavailable", detail: data.message ?? upstream.statusText },
      { status: 502 },
    );
  }

  const balance = data.balances?.[0] ?? {};
  const available = typeof balance.balance === "string" ? balance.balance : "0";
  return NextResponse.json({
    availableMicroUsdc: decimalUsdcToMicroString(available),
    withdrawingMicroUsdc: decimalUsdcToMicroString(balance.withdrawing ?? "0"),
    withdrawableMicroUsdc: decimalUsdcToMicroString(balance.withdrawable ?? "0"),
    formattedAvailable: available,
  });
}

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/payments/gateway/balances", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns Gateway balances as integer micro-USDC strings", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          balances: [
            {
              balance: "1.234567",
              withdrawing: "0.010000",
              withdrawable: "0",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const response = await GET(
      new NextRequest(
        "https://findling.timidan.xyz/api/payments/gateway/balances?address=0x1111111111111111111111111111111111111111",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      availableMicroUsdc: "1234567",
      withdrawingMicroUsdc: "10000",
      withdrawableMicroUsdc: "0",
      formattedAvailable: "1.234567",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway-api-testnet.circle.com/v1/balances",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          token: "USDC",
          sources: [
            {
              depositor: "0x1111111111111111111111111111111111111111",
              domain: 26,
            },
          ],
        }),
      }),
    );
  });

  it("rejects invalid wallet addresses before calling Circle", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await GET(
      new NextRequest(
        "https://findling.timidan.xyz/api/payments/gateway/balances?address=not-a-wallet",
      ),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

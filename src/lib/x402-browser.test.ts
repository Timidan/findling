import { describe, expect, it } from "vitest";
import {
  ARC_TESTNET_ADD_CHAIN_PARAMS,
  classifyGatewayReadiness,
  isUnrecognizedChainError,
  microUsdcToDecimal,
} from "./x402-browser";

describe("Gateway payment readiness", () => {
  it("formats integer micro-USDC without using floats", () => {
    expect(microUsdcToDecimal(700_000)).toBe("0.7");
    expect(microUsdcToDecimal(BigInt(50_001))).toBe("0.050001");
    expect(microUsdcToDecimal(BigInt(2_000_000))).toBe("2");
  });

  it("is ready when Gateway already covers the clip price", () => {
    expect(
      classifyGatewayReadiness({
        requiredMicroUsdc: 700_000,
        gatewayAvailableMicroUsdc: BigInt(800_000),
        walletMicroUsdc: BigInt(0),
        allowanceMicroUsdc: BigInt(0),
      }),
    ).toMatchObject({
      status: "ready",
      shortfallMicroUsdc: BigInt(0),
      allowanceNeeded: false,
    });
  });

  it("asks to fund Gateway when wallet USDC covers the shortfall", () => {
    expect(
      classifyGatewayReadiness({
        requiredMicroUsdc: 700_000,
        gatewayAvailableMicroUsdc: BigInt(200_000),
        walletMicroUsdc: BigInt(700_000),
        allowanceMicroUsdc: BigInt(100_000),
      }),
    ).toMatchObject({
      status: "needs_gateway_funding",
      shortfallMicroUsdc: BigInt(500_000),
      allowanceNeeded: true,
    });
  });

  it("blocks payment setup when the wallet cannot cover the Gateway shortfall", () => {
    expect(
      classifyGatewayReadiness({
        requiredMicroUsdc: 700_000,
        gatewayAvailableMicroUsdc: BigInt(200_000),
        walletMicroUsdc: BigInt(100_000),
        allowanceMicroUsdc: BigInt(1_000_000),
      }),
    ).toMatchObject({
      status: "needs_wallet_usdc",
      shortfallMicroUsdc: BigInt(500_000),
      walletShortfallMicroUsdc: BigInt(400_000),
    });
  });

  it("has EIP-3085 Arc Testnet params for wallets that have not added the chain", () => {
    expect(ARC_TESTNET_ADD_CHAIN_PARAMS).toMatchObject({
      chainId: "0x4cef52",
      chainName: "Arc Testnet",
      rpcUrls: ["https://rpc.testnet.arc.network"],
      blockExplorerUrls: ["https://testnet.arcscan.app"],
    });
    expect(isUnrecognizedChainError({ code: 4902 })).toBe(true);
    expect(isUnrecognizedChainError(new Error("Unrecognized chain ID"))).toBe(true);
  });
});

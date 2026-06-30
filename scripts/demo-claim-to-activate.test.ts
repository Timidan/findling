import { describe, expect, it } from "vitest";
import {
  assertSeedFinderSplit,
  extractUnlockParams,
  formatMicroUsdc,
} from "./demo-claim-to-activate";

describe("demo claim-to-activate helpers", () => {
  it("formats integer micro-USDC without floating point math", () => {
    expect(formatMicroUsdc(120_000)).toBe("0.12");
    expect(formatMicroUsdc(1_000_000)).toBe("1");
    expect(formatMicroUsdc(1)).toBe("0.000001");
  });

  it("extracts the grant and agent run carried by a pledge unlock URL", () => {
    expect(
      extractUnlockParams(
        "https://findling.example/api/payments/x402/moments/m1/unlock?grantId=g1&agentRunId=r1",
      ),
    ).toEqual({ grantId: "g1", agentRunId: "r1" });
  });

  it("rejects a settled purchase that did not pay the seed finder leg", () => {
    expect(() =>
      assertSeedFinderSplit({
        grossMicroUsdc: 120_000,
        creatorMicroUsdc: 96_000,
        finderMicroUsdc: 0,
        platformMicroUsdc: 24_000,
        finderId: null,
        expectedFinderId: "seed-finder",
      }),
    ).toThrow("seed finder was not paid");
  });
});

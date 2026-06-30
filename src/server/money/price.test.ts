import { describe, expect, it } from "vitest";
import { parsePriceMicroUsdcInput } from "./price";

describe("parsePriceMicroUsdcInput", () => {
  it("accepts an integer micro-USDC boundary value", () => {
    expect(
      parsePriceMicroUsdcInput(
        { priceMicroUsdc: 50_001 },
        { defaultMicroUsdc: 50_000, minMicroUsdc: 1_000, maxMicroUsdc: 100_000_000 },
      ),
    ).toBe(50_001);
  });

  it("parses decimal USD strings exactly at six fractional places", () => {
    expect(
      parsePriceMicroUsdcInput(
        { priceUsd: "0.001001" },
        { defaultMicroUsdc: 50_000, minMicroUsdc: 1_000, maxMicroUsdc: 100_000_000 },
      ),
    ).toBe(1_001);
    expect(
      parsePriceMicroUsdcInput(
        { priceUsd: "100" },
        { defaultMicroUsdc: 50_000, minMicroUsdc: 1_000, maxMicroUsdc: 100_000_000 },
      ),
    ).toBe(100_000_000);
  });

  it("uses the default price when no price field is provided", () => {
    expect(
      parsePriceMicroUsdcInput(
        {},
        { defaultMicroUsdc: 50_000, minMicroUsdc: 1_000, maxMicroUsdc: 100_000_000 },
      ),
    ).toBe(50_000);
  });

  it("rejects exponent notation, over-precision, and non-finite values", () => {
    const opts = {
      defaultMicroUsdc: 50_000,
      minMicroUsdc: 1_000,
      maxMicroUsdc: 100_000_000,
    };

    expect(() => parsePriceMicroUsdcInput({ priceUsd: "1e3" }, opts)).toThrow(
      "invalid_price",
    );
    expect(() =>
      parsePriceMicroUsdcInput({ priceUsd: "0.0000001" }, opts),
    ).toThrow("invalid_price");
    expect(() => parsePriceMicroUsdcInput({ priceUsd: Number.NaN }, opts)).toThrow(
      "invalid_price",
    );
  });

  it("rejects out-of-envelope prices after exact parsing", () => {
    const opts = {
      defaultMicroUsdc: 50_000,
      minMicroUsdc: 1_000,
      maxMicroUsdc: 100_000_000,
    };

    expect(() => parsePriceMicroUsdcInput({ priceUsd: "0.000999" }, opts)).toThrow(
      "invalid_price",
    );
    expect(() =>
      parsePriceMicroUsdcInput({ priceMicroUsdc: 100_000_001 }, opts),
    ).toThrow("invalid_price");
  });
});

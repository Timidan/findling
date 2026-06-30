import { describe, it, expect } from "vitest";
import { computeSplit, SPLIT_BPS, MAX_GROSS_MICRO_USDC } from "./split";

describe("computeSplit", () => {
  it("splits $0.05 (50000 micro-USDC) into 40000 / 6000 / 4000 with a finder", () => {
    expect(computeSplit({ grossMicroUsdc: 50000, hasFinder: true })).toEqual({
      creatorMicroUsdc: 40000,
      finderMicroUsdc: 6000,
      platformMicroUsdc: 4000,
      remainderPolicy: "creator_receives_remainder",
    });
  });

  it("routes the finder share to the platform when there is no finder", () => {
    expect(computeSplit({ grossMicroUsdc: 50000, hasFinder: false })).toEqual({
      creatorMicroUsdc: 40000,
      finderMicroUsdc: 0,
      platformMicroUsdc: 10000,
      remainderPolicy: "creator_receives_remainder",
    });
  });

  it("preserves the total and gives the rounding remainder to the creator on tiny amounts", () => {
    const r = computeSplit({ grossMicroUsdc: 7, hasFinder: true });
    expect(r.creatorMicroUsdc + r.finderMicroUsdc + r.platformMicroUsdc).toBe(7);
    // 7 * 0.12 = 0.84 -> floor 0 ; 7 * 0.08 = 0.56 -> floor 0 ; creator keeps the rest
    expect(r).toEqual({
      creatorMicroUsdc: 7,
      finderMicroUsdc: 0,
      platformMicroUsdc: 0,
      remainderPolicy: "creator_receives_remainder",
    });
  });

  it("never loses or mints value — parts always sum to gross", () => {
    const grosses = [1, 3, 99, 12345, 50000, 999999, 1_000_000_000_000];
    for (const grossMicroUsdc of grosses) {
      for (const hasFinder of [true, false]) {
        const r = computeSplit({ grossMicroUsdc, hasFinder });
        expect(r.creatorMicroUsdc + r.finderMicroUsdc + r.platformMicroUsdc).toBe(
          grossMicroUsdc,
        );
        expect(r.creatorMicroUsdc).toBeGreaterThanOrEqual(0);
        expect(r.finderMicroUsdc).toBeGreaterThanOrEqual(0);
        expect(r.platformMicroUsdc).toBeGreaterThanOrEqual(0);
        if (!hasFinder) expect(r.finderMicroUsdc).toBe(0);
      }
    }
  });

  it("accepts gross exactly at the documented ceiling and still sums to gross", () => {
    const r = computeSplit({ grossMicroUsdc: MAX_GROSS_MICRO_USDC, hasFinder: true });
    expect(r.creatorMicroUsdc + r.finderMicroUsdc + r.platformMicroUsdc).toBe(
      MAX_GROSS_MICRO_USDC,
    );
  });

  it("rejects gross above the documented ceiling (defends Number precision)", () => {
    expect(() =>
      computeSplit({ grossMicroUsdc: MAX_GROSS_MICRO_USDC + 1, hasFinder: true }),
    ).toThrow();
  });

  it("rejects non-positive or non-integer gross amounts", () => {
    expect(() => computeSplit({ grossMicroUsdc: 0, hasFinder: true })).toThrow();
    expect(() => computeSplit({ grossMicroUsdc: -5, hasFinder: true })).toThrow();
    expect(() => computeSplit({ grossMicroUsdc: 1.5, hasFinder: true })).toThrow();
    expect(() =>
      computeSplit({ grossMicroUsdc: Number.NaN, hasFinder: true }),
    ).toThrow();
  });

  it("exposes the 80 / 12 / 8 basis points (sum to 10000)", () => {
    expect(SPLIT_BPS).toEqual({ creator: 8000, finder: 1200, platform: 800 });
    expect(SPLIT_BPS.creator + SPLIT_BPS.finder + SPLIT_BPS.platform).toBe(10000);
  });
});

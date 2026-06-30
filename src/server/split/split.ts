// SplitEngine — pure, deterministic, integer micro-USDC payment split.
// creator 80% / finder 12% / platform 8%. Rounding remainder goes to the creator.
// Money is integer micro-USDC (1 USDC = 1_000_000). No floats in the result.

export const SPLIT_BPS = { creator: 8000, finder: 1200, platform: 800 } as const;
const BPS_DENOMINATOR = BigInt(10_000);

/**
 * Documented ceiling on a single gross amount: 1,000,000 USDC in micro-USDC.
 * BigInt makes the split math exact, but the legs are returned as `number`, so we
 * refuse anything beyond this (well above any real nanopayment price) rather than
 * risk operating near Number's safe-integer boundary.
 */
export const MAX_GROSS_MICRO_USDC = 1_000_000_000_000;

export interface SplitInput {
  /** Gross paid amount in integer micro-USDC (1 USDC = 1_000_000). */
  grossMicroUsdc: number;
  /** Whether a finder is attributed to this purchase. */
  hasFinder: boolean;
}

export interface SplitResult {
  creatorMicroUsdc: number;
  finderMicroUsdc: number;
  platformMicroUsdc: number;
  remainderPolicy: "creator_receives_remainder";
}

export function computeSplit({
  grossMicroUsdc,
  hasFinder,
}: SplitInput): SplitResult {
  if (!Number.isInteger(grossMicroUsdc) || grossMicroUsdc <= 0) {
    throw new Error(
      `computeSplit: grossMicroUsdc must be a positive integer micro-USDC amount, got ${grossMicroUsdc}`,
    );
  }
  if (grossMicroUsdc > MAX_GROSS_MICRO_USDC) {
    throw new Error(
      `computeSplit: grossMicroUsdc ${grossMicroUsdc} exceeds the max ${MAX_GROSS_MICRO_USDC} (1,000,000 USDC)`,
    );
  }

  // BigInt math so the documented $1M ceiling (1e12 micro * 8000 bps) cannot
  // overflow Number's safe-integer range. Floors are exact (BigInt division).
  const g = BigInt(grossMicroUsdc);
  const creatorBase = Number((g * BigInt(SPLIT_BPS.creator)) / BPS_DENOMINATOR);
  const finderBase = Number((g * BigInt(SPLIT_BPS.finder)) / BPS_DENOMINATOR);
  const platformBase = Number((g * BigInt(SPLIT_BPS.platform)) / BPS_DENOMINATOR);

  // Whatever sub-unit was lost to flooring goes to the creator (primary rights-holder),
  // guaranteeing the three parts always sum exactly to gross.
  const remainder = grossMicroUsdc - creatorBase - finderBase - platformBase;

  const creatorMicroUsdc = creatorBase + remainder;
  let finderMicroUsdc = finderBase;
  let platformMicroUsdc = platformBase;

  // No attributed finder → the 12% finder share routes to platform suspense.
  if (!hasFinder) {
    platformMicroUsdc += finderMicroUsdc;
    finderMicroUsdc = 0;
  }

  return {
    creatorMicroUsdc,
    finderMicroUsdc,
    platformMicroUsdc,
    remainderPolicy: "creator_receives_remainder",
  };
}

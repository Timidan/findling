import type { PaymentProviderName } from "./types";

export interface BuildX402ChallengeInput {
  /** Price in integer micro-USDC. */
  priceMicroUsdc: number;
  /** Canonical unlock URL this payment is bound to. */
  resourceUrl: string;
  description?: string;
  maxTimeoutSeconds?: number;
}

export type X402Verification =
  | { ok: true; payer: string }
  | { ok: false; reason?: string };

export type X402Settlement =
  | {
      ok: true;
      paymentReference: string;
      payerAddress: string;
      network: string;
    }
  | { ok: false; network: string; reason?: string };

export interface X402SellerPaymentAdapter {
  readonly name: PaymentProviderName;
  buildChallengeHeader(input: BuildX402ChallengeInput): Promise<string>;
  verify(
    paymentHeader: string,
    input: BuildX402ChallengeInput,
  ): Promise<X402Verification>;
  settle(
    paymentHeader: string,
    input: BuildX402ChallengeInput,
  ): Promise<X402Settlement>;
  encodeSettlementHeader(settlement: unknown): string;
}

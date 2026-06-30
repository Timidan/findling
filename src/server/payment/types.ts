/**
 * Payment seam — ONE provider boundary the agent-pays loop talks to.
 *
 * Per the step-1 spike: the SELLER (Findling) acts as facilitator and runs
 * verify + settle; the BUYER (the consumer's own agent) presents an x402
 * payment payload signed by a funded session key. Gross settles to ONE
 * sellerAddress; the app-level ledger derives the 80/12/8 split afterwards.
 *
 * Payment NEVER computes creator/finder/platform shares — that is `split/`.
 * Two implementations slot behind this interface:
 *   - GatewayX402PaymentProvider (real Circle Gateway / x402 on Arc testnet)
 *   - MockPaymentProvider (deterministic; lets the agent loop + ledger be built
 *     and tested before wiring live Arc).
 */

export type PaymentProviderName = "gateway_x402" | "mock";

export interface BuildRequirementInput {
  /** Price to charge, integer micro-USDC. */
  amountMicroUsdc: number;
  /** The single seller address gross settles to. */
  sellerAddress: string;
  /**
   * Network identifier. NOTE: two formats coexist on the money path —
   * withdrawals use the Gateway SDK chain NAME ("arcTestnet"), while x402
   * verify/settle use the CAIP-2 chain id ("eip155:5042002"). This field is the
   * chain NAME passed to the payout SDK, not the CAIP-2 id.
   */
  network: string;
  /**
   * The canonical unlock URL/endpoint this payment is for — the x402 protected
   * resource (e.g. `/api/agent/moments/<id>/unlock`). x402 binds the payment to
   * this exact resource, so it must be the real route, not just an id.
   */
  resource: string;
  /** Caller-supplied idempotency key; one settled payment per key. */
  idempotencyKey: string;
  description?: string;
}

/** The machine-readable terms returned inside an HTTP 402 response. */
export interface PaymentRequirement {
  amountMicroUsdc: number;
  sellerAddress: string;
  network: string;
  /** Canonical unlock URL/endpoint the payment is bound to (see above). */
  resource: string;
  idempotencyKey: string;
  description?: string;
}

export type PaymentVerification =
  | {
      ok: true;
      /** The funded session-key EOA that signed the payload. */
      payerAddress: string;
    }
  | { ok: false; reason: string };

/**
 * Discriminated so a successful settlement ALWAYS carries the canonical
 * paymentReference + payerAddress the ledger needs — no optional money fields.
 */
export type PaymentSettlement =
  | {
      ok: true;
      /** Canonical on-chain reference (tx hash / settlement id) for the ledger. */
      paymentReference: string;
      /** The session-key EOA that actually paid (asserted against the grant). */
      payerAddress: string;
      network: string;
    }
  | { ok: false; network: string; reason: string };

export interface WithdrawInput {
  recipientAddress: string;
  amountMicroUsdc: number;
  network: string;
  /**
   * Max fee the payout may burn, as a decimal USDC string (SDK default ~2.01).
   * Batched payouts set this so a tiny share isn't dwarfed by the fee.
   */
  maxFee?: string;
  /**
   * Intended payout idempotency key. CAVEAT: the real Gateway SDK's withdraw()
   * accepts no idempotency key, so this is NOT forwarded on-chain — double-pay is
   * prevented app-side instead (per-user+role advisory lock + counting in-flight
   * 'requested'/'submitted' rows against the balance; see ledger/withdrawal.ts).
   */
  reference: string;
}

export interface WithdrawResult {
  ok: boolean;
  transactionHash?: string;
  providerReference?: string;
  reason?: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** Build the terms we hand back in an HTTP 402 challenge. */
  buildRequirement(input: BuildRequirementInput): PaymentRequirement;
  /** Verify a presented x402 payload satisfies the requirement (no settle). */
  verify(
    payload: unknown,
    requirement: PaymentRequirement,
  ): Promise<PaymentVerification>;
  /** Settle on-chain via the facilitator; returns the canonical reference. */
  settle(
    payload: unknown,
    requirement: PaymentRequirement,
  ): Promise<PaymentSettlement>;
  /** Real Arc-testnet payout for creator/finder withdrawals. */
  withdraw(input: WithdrawInput): Promise<WithdrawResult>;
}

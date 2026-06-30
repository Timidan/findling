/**
 * MockPaymentProvider — deterministic, no chain. Lets us build and test the
 * agent-pays loop + ledger before wiring live Circle Gateway / x402 on Arc.
 *
 * Determinism: all references derive from the caller's idempotencyKey, so the
 * same purchase attempt always yields the same paymentReference — which is
 * exactly what exercises the ledger's idempotency + unique constraints.
 */
import type {
  BuildRequirementInput,
  PaymentProvider,
  PaymentRequirement,
  PaymentSettlement,
  PaymentVerification,
  WithdrawInput,
  WithdrawResult,
} from "./types";

/** Shape the test/demo buyer presents in lieu of a signed x402 payload. */
export interface MockPaymentPayload {
  mock: true;
  payerAddress: string;
  amountMicroUsdc: number;
}

function isMockPayload(p: unknown): p is MockPaymentPayload {
  return (
    typeof p === "object" &&
    p !== null &&
    (p as { mock?: unknown }).mock === true &&
    typeof (p as { payerAddress?: unknown }).payerAddress === "string" &&
    typeof (p as { amountMicroUsdc?: unknown }).amountMicroUsdc === "number"
  );
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;

  buildRequirement(input: BuildRequirementInput): PaymentRequirement {
    return {
      amountMicroUsdc: input.amountMicroUsdc,
      sellerAddress: input.sellerAddress,
      network: input.network,
      resource: input.resource,
      idempotencyKey: input.idempotencyKey,
      description: input.description,
    };
  }

  async verify(
    payload: unknown,
    requirement: PaymentRequirement,
  ): Promise<PaymentVerification> {
    if (!isMockPayload(payload)) {
      return { ok: false, reason: "malformed_payload" };
    }
    if (payload.amountMicroUsdc < requirement.amountMicroUsdc) {
      return { ok: false, reason: "insufficient_amount" };
    }
    return { ok: true, payerAddress: payload.payerAddress };
  }

  async settle(
    payload: unknown,
    requirement: PaymentRequirement,
  ): Promise<PaymentSettlement> {
    const v = await this.verify(payload, requirement);
    if (!v.ok) {
      return { ok: false, network: requirement.network, reason: v.reason };
    }
    return {
      ok: true,
      paymentReference: `mock_${requirement.idempotencyKey}`,
      payerAddress: v.payerAddress,
      network: requirement.network,
    };
  }

  async withdraw(input: WithdrawInput): Promise<WithdrawResult> {
    if (input.amountMicroUsdc <= 0) {
      return { ok: false, reason: "non_positive_amount" };
    }
    return {
      ok: true,
      transactionHash: `mock_tx_${input.reference}`,
      providerReference: `mock_wd_${input.reference}`,
    };
  }
}

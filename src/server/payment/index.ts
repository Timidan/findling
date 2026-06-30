/**
 * Payment provider wiring (built from env; nothing hits a chain without explicit
 * configuration):
 *   - getGatewayProvider(): the real Arc x402 provider used for buys/settle and,
 *     when selected, for payouts.
 *   - getPayoutProvider():  the provider used for withdrawals — the real Gateway
 *     when PAYMENT_PROVIDER=gateway_x402, else the deterministic mock (refused in
 *     production so a misconfig can never mint a fake "succeeded" payout).
 */
import type { PaymentProvider } from "./types";
import { MockPaymentProvider } from "./mock-provider";
import { GatewayX402PaymentProvider } from "./gateway-x402-provider";

export * from "./types";
export * from "./x402-seller";
export { MockPaymentProvider } from "./mock-provider";
export { GatewayX402PaymentProvider } from "./gateway-x402-provider";

let gatewayCached: GatewayX402PaymentProvider | null = null;

/** The real Arc x402 provider, built from env. Throws if not configured. */
export function getGatewayProvider(): GatewayX402PaymentProvider {
  if (gatewayCached) return gatewayCached;
  const facilitatorUrl = process.env.GATEWAY_FACILITATOR_URL;
  const sellerAddress = process.env.SELLER_ADDRESS;
  const sellerPrivateKey = process.env.SELLER_PRIVATE_KEY;
  if (!facilitatorUrl || !sellerAddress) {
    throw new Error(
      "Gateway provider not configured: set GATEWAY_FACILITATOR_URL and SELLER_ADDRESS.",
    );
  }
  gatewayCached = new GatewayX402PaymentProvider({
    facilitatorUrl,
    sellerAddress,
    sellerPrivateKey,
  });
  return gatewayCached;
}

/**
 * The provider used for PAYOUTS (withdrawals). Real Arc payout when
 * PAYMENT_PROVIDER=gateway_x402 (needs a funded seller Gateway balance);
 * otherwise the mock provider so the withdrawal ledger flow runs without funds.
 * Fail closed in production: a mock payout marks withdrawals "succeeded" with a
 * fake tx and silently corrupts balances — never let a prod misconfig do that.
 */
export function getPayoutProvider(): {
  readonly name: "gateway_x402" | "mock";
  withdraw: PaymentProvider["withdraw"];
} {
  if (process.env.PAYMENT_PROVIDER === "gateway_x402") {
    return getGatewayProvider();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing mock payouts in production: set PAYMENT_PROVIDER=gateway_x402 (with a funded seller Gateway balance).",
    );
  }
  return new MockPaymentProvider();
}

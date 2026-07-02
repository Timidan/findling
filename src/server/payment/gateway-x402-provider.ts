/**
 * GatewayX402PaymentProvider — the ONE real payment provider (Circle Gateway
 * Nanopayments over x402, on Arc testnet). Isolates the entire SDK surface so
 * the rest of the app only ever sees plain values.
 *
 * Seller (Findling) = facilitator: builds the x402 402 challenge from the
 * current DB price, then verify()/settle() through `BatchFacilitatorClient`
 * (Circle does all the crypto; settlement is gas-free for us). Gross settles to
 * ONE sellerAddress; the app ledger derives the 80/12/8 split afterwards.
 *
 * Buyer (the consumer's own agent) holds a funded session key and pays via
 * `GatewayClient.pay(url)` — handled entirely client-side, not here.
 *
 * Payouts use the seller's `GatewayClient.withdraw(amount,{recipient})`.
 *
 * Confirmed live (no funds needed) against gateway-api-testnet.circle.com:
 *   scheme "exact", network eip155:5042002, asset USDC 0x3600… (6 decimals),
 *   extra { name:"GatewayWalletBatched", version:"1", verifyingContract:0x0077… }.
 */
import { formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  BatchFacilitatorClient,
  GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS,
} from "@circle-fin/x402-batching/server";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import {
  encodePaymentRequiredHeader,
  decodePaymentSignatureHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { WithdrawInput, WithdrawResult } from "./types";
import type {
  BuildX402ChallengeInput,
  X402Settlement,
  X402SellerPaymentAdapter,
} from "./x402-seller";

/** Arc testnet CAIP-2 id (chain 5042002). */
export const ARC_TESTNET_NETWORK = "eip155:5042002";
/** USDC on Arc testnet has 6 decimals — matches our micro-USDC (1 USDC = 1e6). */
const USDC_DECIMALS = 6;
/**
 * Circle Gateway batched authorizations carry a fixed ~7-day validity window;
 * the buyer SDK signs with max(maxTimeoutSeconds, this), so our published
 * requirement MUST use the same value or verify() fails on a real signature.
 */
const GATEWAY_MAX_TIMEOUT_SECONDS = GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS;

export interface GatewayProviderConfig {
  facilitatorUrl: string;
  sellerAddress: string;
  /** Seller private key — only needed for withdraw() payouts. */
  sellerPrivateKey?: string;
  network?: string;
}

/** The Arc payment "kind" advertised by the facilitator (cached). */
interface ArcKind {
  scheme: string;
  network: string;
  asset: string;
  extra: Record<string, unknown>;
}

export type BuildChallengeInput = BuildX402ChallengeInput;

export type GatewaySettlement = X402Settlement;

export class GatewayX402PaymentProvider implements X402SellerPaymentAdapter {
  readonly name = "gateway_x402" as const;
  private readonly facilitator: BatchFacilitatorClient;
  private arcKind: ArcKind | null = null;

  constructor(private readonly config: GatewayProviderConfig) {
    if (!config.sellerAddress) {
      throw new Error("GatewayX402PaymentProvider: sellerAddress is required");
    }
    // preflight: the seller key (used for withdraw) MUST derive to sellerAddress,
    // else payouts would settle from the wrong wallet.
    if (config.sellerPrivateKey) {
      const derived = privateKeyToAccount(
        config.sellerPrivateKey as `0x${string}`,
      ).address.toLowerCase();
      if (derived !== config.sellerAddress.toLowerCase()) {
        throw new Error(
          "GatewayX402PaymentProvider: SELLER_PRIVATE_KEY does not match SELLER_ADDRESS",
        );
      }
    }
    this.facilitator = new BatchFacilitatorClient({ url: config.facilitatorUrl });
  }

  private get network(): string {
    return this.config.network ?? ARC_TESTNET_NETWORK;
  }

  /** Fetch + cache + VALIDATE the facilitator's Arc payment kind. */
  private async getArcKind(): Promise<ArcKind> {
    if (this.arcKind) return this.arcKind;
    const supported = await this.facilitator.getSupported();
    const kinds =
      (supported as unknown as { kinds?: Array<Record<string, unknown>> }).kinds ?? [];
    const kind = kinds.find((k) => String(k.network) === this.network);
    if (!kind) {
      throw new Error(`facilitator does not support network ${this.network}`);
    }
    if (String(kind.scheme) !== "exact") {
      throw new Error(`expected scheme "exact", got "${kind.scheme}"`);
    }
    const extra = (kind.extra ?? {}) as Record<string, unknown>;
    if (!extra.name || !extra.version || !extra.verifyingContract) {
      throw new Error("facilitator kind missing batching extra (name/version/verifyingContract)");
    }
    const assets =
      (extra.assets as Array<{ symbol?: string; address: string; decimals: number }>) ?? [];
    // pick USDC explicitly and assert 6 decimals (our micro-USDC assumption)
    const usdc =
      assets.find((a) => a.symbol === "USDC") ?? assets[0];
    if (!usdc?.address) throw new Error("facilitator kind missing USDC asset address");
    if (usdc.decimals !== USDC_DECIMALS) {
      throw new Error(
        `expected USDC ${USDC_DECIMALS} decimals, got ${usdc.decimals}. Micro-USDC mapping invalid.`,
      );
    }
    this.arcKind = {
      scheme: String(kind.scheme),
      network: String(kind.network),
      asset: usdc.address,
      // requirements carry only the signing fields, never the assets array
      extra: {
        name: extra.name,
        version: extra.version,
        verifyingContract: extra.verifyingContract,
      },
    };
    return this.arcKind;
  }

  /** Build the x402 PaymentRequirements (v2) for the current price. */
  async buildRequirements(input: BuildChallengeInput) {
    const kind = await this.getArcKind();
    return {
      scheme: kind.scheme,
      network: kind.network,
      asset: kind.asset,
      amount: String(input.priceMicroUsdc),
      payTo: this.config.sellerAddress,
      // Must match the SDK's signed validity window or verify() fails.
      maxTimeoutSeconds: input.maxTimeoutSeconds ?? GATEWAY_MAX_TIMEOUT_SECONDS,
      extra: kind.extra,
    };
  }

  /**
   * Build the base64 PAYMENT-REQUIRED header value for the 402 response.
   * The buyer's GatewayClient.pay() decodes this, signs, and retries.
   */
  async buildChallengeHeader(input: BuildChallengeInput): Promise<string> {
    const requirements = await this.buildRequirements(input);
    return encodePaymentRequiredHeader({
      x402Version: 2,
      // Circle's facilitator REQUIRES resource.description + resource.mimeType
      // (optional in the x402 type, enforced by Gateway batched verify).
      resource: {
        url: input.resourceUrl,
        description: input.description ?? "Findling video moment license",
        mimeType: "application/json",
      } as never,
      accepts: [requirements as never],
    } as never);
  }

  /** Decode the buyer's Payment-Signature header into a payment payload. */
  decodePayment(header: string) {
    return decodePaymentSignatureHeader(header);
  }

  /** Encode a settlement result for the response header (proof for the agent). */
  encodeSettlementHeader(settle: unknown): string {
    return encodePaymentResponseHeader(settle as never);
  }

  /**
   * Verify a paid retry WITHOUT settling (no funds move). Requirements are
   * rebuilt SERVER-SIDE from the current price (never trusted from the buyer).
   * Returns the payer so the caller can bind it to the session grant BEFORE the
   * irreversible settle().
   */
  async verify(
    paymentHeader: string,
    input: BuildChallengeInput,
  ): Promise<{ ok: true; payer: string } | { ok: false; reason?: string }> {
    const requirements = await this.buildRequirements(input);
    const payload = this.decodePayment(paymentHeader);
    const v = (await this.facilitator.verify(payload as never, requirements as never)) as {
      isValid?: boolean;
      payer?: string;
      invalidReason?: string;
    };
    if (!v.isValid) return { ok: false, reason: v.invalidReason ?? "verify_failed" };
    if (!v.payer) return { ok: false, reason: "missing_payer" };
    return { ok: true, payer: v.payer };
  }

  /**
   * Settle a verified payment (IRREVERSIBLE — moves funds). Only call after
   * verify() passed and the payer was bound to the grant. Requirements are
   * rebuilt server-side again so the settle matches exactly what we required.
   */
  async settle(
    paymentHeader: string,
    input: BuildChallengeInput,
  ): Promise<GatewaySettlement> {
    const requirements = await this.buildRequirements(input);
    const payload = this.decodePayment(paymentHeader);
    const s = (await this.facilitator.settle(payload as never, requirements as never)) as {
      success: boolean;
      payer?: string;
      transaction?: string;
      network?: string;
      errorReason?: string;
    };
    if (!s.success) {
      // Clean failure — the facilitator reports no settlement, so no funds moved.
      // Safe for the caller to release the reserved grant cap.
      return {
        ok: false,
        network: this.network,
        reason: s.errorReason ?? "settle_failed",
        unknownOutcome: false,
      };
    }
    // success:true but we cannot obtain canonical proof (tx hash / payer): funds
    // MAY have moved. Surface as an UNKNOWN outcome so the caller keeps the cap
    // reserved and holds the reservation for reconciliation (never releases it).
    if (!s.transaction || !s.payer) {
      return {
        ok: false,
        network: this.network,
        reason: !s.transaction ? "success_without_transaction" : "success_without_payer",
        unknownOutcome: true,
      };
    }
    // success:true on a DIFFERENT network than required — funds moved, but not
    // where we required. Also ambiguous: hold for reconciliation, don't release.
    if (s.network && s.network !== requirements.network) {
      return {
        ok: false,
        network: this.network,
        reason: "network_mismatch_after_success",
        unknownOutcome: true,
      };
    }
    return {
      ok: true,
      paymentReference: s.transaction,
      payerAddress: s.payer,
      network: this.network,
    };
  }

  /** Real Arc-testnet payout from the seller's Gateway balance. */
  async withdraw(input: WithdrawInput): Promise<WithdrawResult> {
    if (!this.config.sellerPrivateKey) {
      return { ok: false, reason: "seller_private_key_not_configured" };
    }
    if (input.amountMicroUsdc <= 0) {
      return { ok: false, reason: "non_positive_amount" };
    }
    const client = new GatewayClient({
      chain: "arcTestnet",
      privateKey: this.config.sellerPrivateKey as `0x${string}`,
    });
    const decimal = formatUnits(BigInt(input.amountMicroUsdc), USDC_DECIMALS);
    // NOTE: the Gateway SDK's withdraw() takes no idempotency key, so input.reference
    // can't be forwarded. Double-pay is prevented entirely app-side instead — the
    // withdrawal service serializes per user+role with a tx advisory lock, advances
    // the row past 'requested', and counts in-flight ('submitted') against the
    // balance — so withdraw() is only ever called once per withdrawal row.
    const res = await client.withdraw(decimal, {
      recipient: input.recipientAddress as `0x${string}`,
      maxFee: input.maxFee,
    });
    // SDK WithdrawResult uses `mintTxHash` (with older fallbacks).
    const r = res as { mintTxHash?: string; transactionHash?: string; txHash?: string };
    const tx = r.mintTxHash ?? r.transactionHash ?? r.txHash;
    return { ok: true, transactionHash: tx, providerReference: tx };
  }
}

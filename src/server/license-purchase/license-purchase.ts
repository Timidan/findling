/**
 * License Purchase Module.
 *
 * The route Adapter passes HTTP facts in; this Module owns the purchase
 * ordering: live price challenge, verify-before-grant, payer binding, grant
 * reservation, settlement, ledger write, attribution, trace close, and content
 * release.
 */
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  agentRuns,
  buyerSessionGrants,
  curations,
  purchases,
  receipts,
} from "@/server/db/schema";
import { findLicensableMoment } from "@/server/catalog/licensable";
import { reserveGrantCap, releaseGrantCap } from "@/server/grants/spend";
import {
  recordSettlement,
  SettlementError,
} from "@/server/ledger/settlement";
import {
  createPendingPurchaseReservation,
  markPurchaseReservationSettled,
  markPurchaseReservationUnknown,
  releasePendingPurchaseReservation,
} from "./purchase-reservation";
import { supabaseStorage } from "@/server/storage/supabase-storage";
import type {
  BuildX402ChallengeInput,
  X402SellerPaymentAdapter,
} from "@/server/payment";

const SIGNED_URL_TTL_SECONDS = 300;

export interface LicensePurchaseInput {
  momentId: string;
  grantId: string | null;
  agentRunId: string | null;
  origin: string;
  pathname: string;
  paymentHeader: string | null;
  paymentProvider: X402SellerPaymentAdapter;
  sellerAddress: string;
}

export interface LicensePurchaseResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

function response(
  body: unknown,
  status: number,
  headers?: Record<string, string>,
): LicensePurchaseResponse {
  return { body, status, headers };
}

async function issueUnlockResponse(input: {
  momentClipStorageKey: string;
  receiptCode?: string | null;
  paymentReference: string;
  payerAddress?: string | null;
  creatorMicroUsdc: number;
  finderMicroUsdc: number;
  platformMicroUsdc: number;
  reused: boolean;
}): Promise<LicensePurchaseResponse> {
  const unlockUrl = await supabaseStorage.createSignedDownloadUrl(
    input.momentClipStorageKey,
    SIGNED_URL_TTL_SECONDS,
  );
  return response(
    {
      unlockUrl,
      unlockExpiresInSeconds: SIGNED_URL_TTL_SECONDS,
      receiptCode: input.receiptCode,
      paymentReference: input.paymentReference,
      payer: input.payerAddress,
      split: {
        creatorMicroUsdc: input.creatorMicroUsdc,
        finderMicroUsdc: input.finderMicroUsdc,
        platformMicroUsdc: input.platformMicroUsdc,
      },
      reused: input.reused,
    },
    200,
  );
}

async function findPriorSettledPurchase(input: {
  momentId: string;
  buyerId: string;
  grantId: string;
  agentRunId: string | null;
}) {
  if (input.agentRunId) {
    const priorRun = (
      await db.select().from(agentRuns).where(eq(agentRuns.id, input.agentRunId))
    )[0];
    if (priorRun?.purchaseId && priorRun.paymentStatus === "settled") {
      const prior = (
        await db.select().from(purchases).where(eq(purchases.id, priorRun.purchaseId))
      )[0];
      if (
        prior &&
        prior.status === "settled" &&
        prior.momentId === input.momentId &&
        prior.buyerId === input.buyerId &&
        prior.sessionGrantId === input.grantId
      ) {
        return prior;
      }
    }
  }

  return (
    await db
      .select()
      .from(purchases)
      .where(
        and(
          eq(purchases.momentId, input.momentId),
          eq(purchases.buyerId, input.buyerId),
          eq(purchases.sessionGrantId, input.grantId),
          eq(purchases.status, "settled"),
        ),
      )
      .orderBy(desc(purchases.settledAt))
      .limit(1)
  )[0];
}

export async function runLicensePurchase(
  input: LicensePurchaseInput,
): Promise<LicensePurchaseResponse> {
  const licensable = await findLicensableMoment(input.momentId);
  if (!licensable) {
    return response({ error: "moment_not_available" }, 404);
  }
  const { moment } = licensable;

  if (!input.grantId) {
    return response({ error: "grant_required" }, 400);
  }

  const price = moment.priceMicroUsdc;
  const challenge: BuildX402ChallengeInput = {
    priceMicroUsdc: price,
    resourceUrl: `${input.origin}${input.pathname}`,
    description: `Findling license: ${moment.title}`,
  };

  if (!input.paymentHeader) {
    let header: string;
    try {
      header = await input.paymentProvider.buildChallengeHeader(challenge);
    } catch (e) {
      console.error("[license purchase] buildChallengeHeader threw:", e);
      return response({ error: "challenge_unavailable" }, 502);
    }
    return response(
      { error: "payment_required", priceUsd: moment.priceUsdSnapshot },
      402,
      { "PAYMENT-REQUIRED": header },
    );
  }

  let verification;
  try {
    verification = await input.paymentProvider.verify(input.paymentHeader, challenge);
  } catch (e) {
    console.error("[license purchase] verify threw:", e);
    return response({ error: "verify_error" }, 400);
  }
  if (!verification.ok) {
    return response({ error: "verify_failed", reason: verification.reason }, 402);
  }

  const grant = (
    await db
      .select()
      .from(buyerSessionGrants)
      .where(eq(buyerSessionGrants.id, input.grantId))
  )[0];
  if (!grant) {
    return response({ error: "grant_not_found" }, 404);
  }
  if (verification.payer.toLowerCase() !== grant.sessionKeyAddress.toLowerCase()) {
    return response({ error: "payer_not_session_key" }, 403);
  }
  if (
    grant.allowedUsageTypes &&
    grant.allowedUsageTypes.length > 0 &&
    !grant.allowedUsageTypes.includes(moment.usageType)
  ) {
    return response({ error: "usage_not_allowed" }, 403);
  }

  const reserved = await reserveGrantCap(grant.id, price);
  if (!reserved) {
    const freshGrant = (
      await db
        .select()
        .from(buyerSessionGrants)
        .where(eq(buyerSessionGrants.id, grant.id))
    )[0];
    const replayEligible =
      !!freshGrant &&
      (freshGrant.status === "active" || freshGrant.status === "exhausted") &&
      (!freshGrant.expiresAt || freshGrant.expiresAt > new Date());
    if (replayEligible) {
      const prior = await findPriorSettledPurchase({
        momentId: input.momentId,
        buyerId: grant.buyerId,
        grantId: grant.id,
        agentRunId: input.agentRunId,
      });
      if (prior) {
        const priorReceipt = (
          await db.select().from(receipts).where(eq(receipts.purchaseId, prior.id))
        )[0];
        return issueUnlockResponse({
          momentClipStorageKey: moment.clipStorageKey!,
          receiptCode: priorReceipt?.receiptCode,
          paymentReference: prior.paymentReference,
          payerAddress: prior.payerAddress,
          creatorMicroUsdc: prior.creatorMicroUsdc,
          finderMicroUsdc: prior.finderMicroUsdc,
          platformMicroUsdc: prior.platformMicroUsdc,
          reused: true,
        });
      }
    }
    return response({ error: "over_remaining_cap" }, 403);
  }

  let reservation;
  try {
    reservation = await createPendingPurchaseReservation({
      momentId: input.momentId,
      buyerId: grant.buyerId,
      sessionGrantId: grant.id,
      agentRunId: input.agentRunId,
      amountMicroUsdc: price,
      provider: input.paymentProvider.name,
      sellerAddress: input.sellerAddress,
      payerAddress: verification.payer,
      paymentHeader: input.paymentHeader,
    });
  } catch (e) {
    await releaseGrantCap(grant.id, price);
    console.error(
      "[license purchase] failed to persist purchase reservation before settle:",
      e,
    );
    return response({ error: "reservation_unavailable" }, 502);
  }

  let settlement;
  try {
    settlement = await input.paymentProvider.settle(input.paymentHeader, challenge);
  } catch (e) {
    await markPurchaseReservationUnknown({
      reservationId: reservation.id,
      reason: `settle_exception_unknown_outcome: ${
        e instanceof Error ? e.message : String(e)
      }`,
    });
    console.error(
      "[license purchase] settle threw (possible partial settlement; grant cap kept reserved):",
      e,
    );
    return response({ error: "settlement_error" }, 502);
  }
  if (!settlement.ok) {
    await releasePendingPurchaseReservation({
      reservationId: reservation.id,
      note: settlement.reason ?? "provider returned not settled",
    });
    return response({ error: "payment_not_settled", reason: settlement.reason }, 402);
  }
  if (
    settlement.payerAddress.toLowerCase() !==
    grant.sessionKeyAddress.toLowerCase()
  ) {
    await markPurchaseReservationUnknown({
      reservationId: reservation.id,
      reason: "settled_payer_mismatch",
      paymentReference: settlement.paymentReference,
      network: settlement.network,
    });
    console.error("[license purchase] settled payer did not match grant session key");
    return response({ error: "settled_payer_mismatch" }, 403);
  }

  let validRun: typeof agentRuns.$inferSelect | undefined;
  if (input.agentRunId) {
    const run = (
      await db.select().from(agentRuns).where(eq(agentRuns.id, input.agentRunId))
    )[0];
    if (
      run &&
      run.sessionGrantId === grant.id &&
      Array.isArray(run.candidateMomentIds) &&
      run.candidateMomentIds.includes(input.momentId)
    ) {
      validRun = run;
    }
  }
  const curationRow = validRun
    ? (
        await db
          .select()
          .from(curations)
          .where(
            and(
              eq(curations.momentId, input.momentId),
              lt(curations.createdAt, validRun.startedAt),
            ),
          )
          .orderBy(asc(curations.createdAt))
      )[0]
    : undefined;
  const curation =
    curationRow && curationRow.finderId !== grant.buyerId ? curationRow : undefined;

  let result;
  try {
    result = await recordSettlement({
      momentId: input.momentId,
      buyerId: grant.buyerId,
      grossMicroUsdc: price,
      finderId: curation?.finderId ?? null,
      curationId: curation?.id ?? null,
      attributionReason: curation ? "earliest_curation_before_run" : null,
      agentRunId: input.agentRunId,
      sessionGrantId: grant.id,
      provider: input.paymentProvider.name,
      paymentReference: settlement.paymentReference,
      network: settlement.network,
      sellerAddress: input.sellerAddress,
      payerAddress: settlement.payerAddress,
      idempotencyKey: `gw:ref:${settlement.paymentReference}`,
      capAlreadyReserved: true,
    });
  } catch (e) {
    await markPurchaseReservationUnknown({
      reservationId: reservation.id,
      reason: `record_settlement_unknown_outcome: ${
        e instanceof Error ? e.message : String(e)
      }`,
      paymentReference: settlement.paymentReference,
      network: settlement.network,
    });
    if (e instanceof SettlementError) {
      console.error("[license purchase] recordSettlement guardrail after settle:", e.reason);
      return response({ error: "guardrail", reason: e.reason }, 403);
    }
    console.error("[license purchase] recordSettlement threw after settle:", e);
    return response({ error: "settlement_record_error" }, 502);
  }

  if (result.reused) {
    await releaseGrantCap(grant.id, price);
  }
  try {
    await markPurchaseReservationSettled({
      reservationId: reservation.id,
      purchaseId: result.purchase.id,
      paymentReference: settlement.paymentReference,
      network: settlement.network,
      note: result.reused ? "settlement_reused; duplicate cap released" : null,
    });
  } catch (e) {
    console.error("[license purchase] failed to resolve purchase reservation:", e);
    return response({ error: "reservation_record_error" }, 502);
  }
  if (
    result.reused &&
    (result.purchase.momentId !== input.momentId ||
      result.purchase.buyerId !== grant.buyerId)
  ) {
    return response({ error: "idempotency_conflict" }, 409);
  }

  if (validRun) {
    await db
      .update(agentRuns)
      .set({
        chosenMomentId: input.momentId,
        chosenCurationId: curation?.id ?? null,
        chosenFinderId: curation?.finderId ?? null,
        attributionReason: curation ? "earliest_curation_before_run" : null,
        paymentStatus: "settled",
        paymentReference: settlement.paymentReference,
        purchaseId: result.purchase.id,
        receiptId: result.receipt?.id ?? null,
        completedAt: new Date(),
      })
      .where(eq(agentRuns.id, validRun.id));
  }

  const responseHeader = input.paymentProvider.encodeSettlementHeader({
    success: true,
    payer: settlement.payerAddress,
    transaction: settlement.paymentReference,
    network: settlement.network,
  });

  const unlock = await issueUnlockResponse({
    momentClipStorageKey: moment.clipStorageKey!,
    receiptCode: result.receipt?.receiptCode,
    paymentReference: settlement.paymentReference,
    payerAddress: settlement.payerAddress,
    creatorMicroUsdc: result.purchase.creatorMicroUsdc,
    finderMicroUsdc: result.purchase.finderMicroUsdc,
    platformMicroUsdc: result.purchase.platformMicroUsdc,
    reused: result.reused,
  });
  return { ...unlock, headers: { ...unlock.headers, "PAYMENT-RESPONSE": responseHeader } };
}

import { createHash } from "node:crypto";
import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  agentRuns,
  buyerSessionGrants,
  curations,
  purchaseReservations,
} from "@/server/db/schema";
import { recordSettlement } from "@/server/ledger/settlement";
import type { PaymentProviderName } from "@/server/payment/types";

type PurchaseReservation = typeof purchaseReservations.$inferSelect;

export interface PendingPurchaseReservation {
  id: string;
  momentId: string;
  buyerId: string;
  sessionGrantId: string;
  agentRunId: string | null;
  amountMicroUsdc: number;
  provider: PaymentProviderName;
  payerAddress: string;
  sellerAddress: string;
  paymentHeaderHash: string;
  status: "pending" | "recording";
  failureReason: string | null;
  createdAt: Date;
}

export function hashPaymentHeader(paymentHeader: string): string {
  return `sha256:${createHash("sha256").update(paymentHeader).digest("hex")}`;
}

/**
 * A reservation for THIS exact signed payment that is still HELD (`pending` or
 * `recording`) — an earlier attempt whose settle outcome is unknown and is
 * awaiting reconciliation. Used to make a client retry idempotent: the caller
 * must NOT re-reserve the grant cap / re-settle the same payment while one is
 * held, or repeated retries would drain the cap and risk a double charge.
 */
export async function findHeldReservationForPaymentHeader(
  paymentHeaderHash: string,
): Promise<PurchaseReservation | null> {
  const rows = await db
    .select()
    .from(purchaseReservations)
    .where(
      and(
        eq(purchaseReservations.paymentHeaderHash, paymentHeaderHash),
        or(
          eq(purchaseReservations.status, "pending"),
          eq(purchaseReservations.status, "recording"),
        ),
      ),
    );
  return rows[0] ?? null;
}

export async function createPendingPurchaseReservation(input: {
  momentId: string;
  buyerId: string;
  sessionGrantId: string;
  agentRunId: string | null;
  amountMicroUsdc: number;
  provider: PaymentProviderName;
  sellerAddress: string;
  payerAddress: string;
  paymentHeader: string;
}) {
  if (
    !Number.isInteger(input.amountMicroUsdc) ||
    input.amountMicroUsdc <= 0
  ) {
    throw new Error(
      "createPendingPurchaseReservation: amountMicroUsdc must be a positive integer",
    );
  }
  const [row] = await db
    .insert(purchaseReservations)
    .values({
      momentId: input.momentId,
      buyerId: input.buyerId,
      sessionGrantId: input.sessionGrantId,
      agentRunId: input.agentRunId,
      amountMicroUsdc: input.amountMicroUsdc,
      provider: input.provider,
      sellerAddress: input.sellerAddress,
      payerAddress: input.payerAddress,
      paymentHeaderHash: hashPaymentHeader(input.paymentHeader),
      status: "pending",
    })
    .returning();
  if (!row) throw new Error("createPendingPurchaseReservation: insert failed");
  return row;
}

export async function markPurchaseReservationUnknown(input: {
  reservationId: string;
  reason: string;
  paymentReference?: string;
  network?: string;
}) {
  const [row] = await db
    .update(purchaseReservations)
    .set({
      failureReason: input.reason,
      settledPaymentReference: input.paymentReference ?? null,
      settledNetwork: input.network ?? null,
      updatedAt: new Date(),
    })
    .where(eq(purchaseReservations.id, input.reservationId))
    .returning();
  return row ?? null;
}

export async function markPurchaseReservationSettled(input: {
  reservationId: string;
  purchaseId: string;
  paymentReference: string;
  network: string;
  note?: string | null;
}) {
  const [row] = await db
    .update(purchaseReservations)
    .set({
      status: "settled",
      purchaseId: input.purchaseId,
      settledPaymentReference: input.paymentReference,
      settledNetwork: input.network,
      failureReason: input.note ?? null,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(purchaseReservations.id, input.reservationId))
    .returning();
  return row ?? null;
}

export async function releasePendingPurchaseReservation(input: {
  reservationId: string;
  note?: string;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(purchaseReservations)
      .set({
        status: "released",
        failureReason: `reconciled_not_settled: ${
          input.note ?? "confirmed no settlement occurred"
        }`,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(purchaseReservations.id, input.reservationId),
          eq(purchaseReservations.status, "pending"),
        ),
      )
      .returning();
    if (!row) return null;

    await tx
      .update(buyerSessionGrants)
      .set({
        remainingCapMicroUsdc: sql`${buyerSessionGrants.remainingCapMicroUsdc} + ${row.amountMicroUsdc}`,
        status: sql`CASE WHEN ${buyerSessionGrants.status} = 'exhausted' THEN 'active' ELSE ${buyerSessionGrants.status} END`,
        updatedAt: new Date(),
      })
      .where(eq(buyerSessionGrants.id, row.sessionGrantId));
    return row;
  });
}

export async function listPendingPurchaseReservations(): Promise<
  PendingPurchaseReservation[]
> {
  const rows = await db
    .select()
    .from(purchaseReservations)
    .where(
      or(
        eq(purchaseReservations.status, "pending"),
        eq(purchaseReservations.status, "recording"),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    momentId: r.momentId,
    buyerId: r.buyerId,
    sessionGrantId: r.sessionGrantId,
    agentRunId: r.agentRunId,
    amountMicroUsdc: r.amountMicroUsdc,
    provider: r.provider,
    payerAddress: r.payerAddress,
    sellerAddress: r.sellerAddress,
    paymentHeaderHash: r.paymentHeaderHash,
    status: r.status as "pending" | "recording",
    failureReason: r.failureReason,
    createdAt: r.createdAt,
  }));
}

export async function reconcilePendingPurchaseReservation(input:
  | {
      reservationId: string;
      outcome: "settled";
      paymentReference: string;
      network: string;
      payerAddress: string;
      note?: string;
    }
  | {
      reservationId: string;
      outcome: "not_settled";
      note?: string;
    }) {
  if (input.outcome === "not_settled") {
    return releasePendingPurchaseReservation({
      reservationId: input.reservationId,
      note: input.note,
    });
  }

  if (!input.paymentReference.trim()) {
    throw new Error(
      "reconcilePendingPurchaseReservation: paymentReference is required",
    );
  }
  if (!input.network.trim()) {
    throw new Error("reconcilePendingPurchaseReservation: network is required");
  }
  if (!input.payerAddress.trim()) {
    throw new Error(
      "reconcilePendingPurchaseReservation: payerAddress is required",
    );
  }

  const reservation = await claimReservationForRecording(input.reservationId);
  if (!reservation) return null;

  try {
    if (
      input.payerAddress.toLowerCase() !==
      reservation.payerAddress.toLowerCase()
    ) {
      throw new Error("settled_payer_mismatch");
    }

    const attribution = await resolveAttribution(reservation);
    const result = await recordSettlement({
      momentId: reservation.momentId,
      buyerId: reservation.buyerId,
      grossMicroUsdc: reservation.amountMicroUsdc,
      finderId: attribution.finderId,
      curationId: attribution.curationId,
      attributionReason: attribution.attributionReason,
      agentRunId: reservation.agentRunId,
      sessionGrantId: reservation.sessionGrantId,
      provider: reservation.provider,
      paymentReference: input.paymentReference,
      network: input.network,
      sellerAddress: reservation.sellerAddress,
      payerAddress: input.payerAddress,
      idempotencyKey: `gw:ref:${input.paymentReference}`,
      capAlreadyReserved: true,
    });

    if (attribution.validRunId) {
      await db
        .update(agentRuns)
        .set({
          chosenMomentId: reservation.momentId,
          chosenCurationId: attribution.curationId,
          chosenFinderId: attribution.finderId,
          attributionReason: attribution.attributionReason,
          paymentStatus: "settled",
          paymentReference: input.paymentReference,
          purchaseId: result.purchase.id,
          receiptId: result.receipt?.id ?? null,
          completedAt: new Date(),
        })
        .where(eq(agentRuns.id, attribution.validRunId));
    }

    return await markPurchaseReservationSettled({
      reservationId: reservation.id,
      purchaseId: result.purchase.id,
      paymentReference: input.paymentReference,
      network: input.network,
      note: input.note ? `reconciled_settled: ${input.note}` : null,
    });
  } catch (e) {
    await markRecordingReservationPending({
      reservationId: reservation.id,
      reason: `reconcile_settled_failed: ${
        e instanceof Error ? e.message : String(e)
      }`,
    });
    throw e;
  }
}

async function claimReservationForRecording(
  reservationId: string,
): Promise<PurchaseReservation | null> {
  const [row] = await db
    .update(purchaseReservations)
    .set({ status: "recording", updatedAt: new Date() })
    .where(
      and(
        eq(purchaseReservations.id, reservationId),
        eq(purchaseReservations.status, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}

async function markRecordingReservationPending(input: {
  reservationId: string;
  reason: string;
}) {
  await db
    .update(purchaseReservations)
    .set({
      status: "pending",
      failureReason: input.reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseReservations.id, input.reservationId),
        eq(purchaseReservations.status, "recording"),
      ),
    );
}

async function resolveAttribution(reservation: PurchaseReservation): Promise<{
  validRunId: string | null;
  finderId: string | null;
  curationId: string | null;
  attributionReason: string | null;
}> {
  if (!reservation.agentRunId) {
    return {
      validRunId: null,
      finderId: null,
      curationId: null,
      attributionReason: null,
    };
  }

  const run = (
    await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, reservation.agentRunId))
  )[0];
  const validRun =
    run &&
    run.sessionGrantId === reservation.sessionGrantId &&
    Array.isArray(run.candidateMomentIds) &&
    run.candidateMomentIds.includes(reservation.momentId);
  if (!validRun) {
    return {
      validRunId: null,
      finderId: null,
      curationId: null,
      attributionReason: null,
    };
  }

  const curationRow = (
    await db
      .select()
      .from(curations)
      .where(
        and(
          eq(curations.momentId, reservation.momentId),
          lt(curations.createdAt, run.startedAt),
        ),
      )
      .orderBy(asc(curations.createdAt))
  )[0];
  if (!curationRow || curationRow.finderId === reservation.buyerId) {
    return {
      validRunId: run.id,
      finderId: null,
      curationId: null,
      attributionReason: null,
    };
  }

  return {
    validRunId: run.id,
    finderId: curationRow.finderId,
    curationId: curationRow.id,
    attributionReason: "earliest_curation_before_run",
  };
}

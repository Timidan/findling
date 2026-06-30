/**
 * Ledger — derives the 80/12/8 split from a settled payment and writes the
 * purchase + receipt (and, for delegated agent purchases, decrements the buyer
 * session-grant cap) as ONE atomic, idempotent transaction.
 *
 * Invariants enforced here (and backstopped by DB constraints):
 *   - exactly one purchase per idempotencyKey (re-settling returns the original)
 *   - exactly one receipt per purchase (receipts.purchase_id is unique)
 *   - split always sums to gross (purchases_split_sums_to_gross CHECK)
 *   - a session-grant's remaining_cap is moved exactly once per purchase and can
 *     never go negative (grants_caps_valid): the unlock route RESERVES it
 *     atomically BEFORE the irreversible settle() (capAlreadyReserved), so here
 *     we skip the decrement; the legacy non-reserved path still decrements once,
 *     atomically with the purchase
 *   - the on-chain payer must equal the grant's session-key address
 *
 * Money is integer micro-USDC throughout. Split math lives in `split/`; the
 * ledger never re-derives percentages itself.
 *
 * Concurrency: two settlements for the SAME grant serialize on a `FOR UPDATE`
 * row lock, so the idempotency pre-check sees the winner's committed purchase.
 * Two grant-less settlements with the same idempotency key race to the insert;
 * the loser hits a unique violation, the tx rolls back, and we recover the
 * winner's rows in a fresh read (a Postgres-aborted tx can't be read from).
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  assets,
  buyerSessionGrants,
  moments,
  purchases,
  receipts,
} from "@/server/db/schema";
import { computeSplit } from "@/server/split/split";
import type { PaymentProviderName } from "@/server/payment/types";

export type SettlementErrorReason =
  | "grant_not_found"
  | "grant_not_active"
  | "grant_expired"
  | "grant_buyer_mismatch"
  | "payer_not_session_key"
  | "over_per_purchase_cap"
  | "over_remaining_cap"
  | "moment_not_found"
  | "asset_not_found";

/** Thrown for guardrail failures the unlock route maps to 402/403/409. */
export class SettlementError extends Error {
  constructor(readonly reason: SettlementErrorReason) {
    super(reason);
    this.name = "SettlementError";
  }
}

export interface RecordSettlementInput {
  momentId: string;
  buyerId: string;
  grossMicroUsdc: number;
  /** Attributed finder (and their curation), if any. Drives the 12% share. */
  finderId?: string | null;
  curationId?: string | null;
  curationScore?: number | null;
  attributionReason?: string | null;
  /** Trace + delegation provenance. */
  agentRunId?: string | null;
  /** When present, the grant cap is asserted + decremented atomically here. */
  sessionGrantId?: string | null;
  /**
   * Set when the caller already RESERVED the grant cap (via reserveGrantCap)
   * before the external settle(). Then this function neither re-asserts the cap
   * nor decrements it again — the reservation already moved the cap atomically.
   */
  capAlreadyReserved?: boolean;
  /** Settlement facts from the PaymentProvider. */
  provider: PaymentProviderName;
  paymentReference: string;
  network: string;
  sellerAddress: string;
  payerAddress?: string | null;
  idempotencyKey: string;
}

export interface SettlementResult {
  purchase: typeof purchases.$inferSelect;
  receipt: typeof receipts.$inferSelect | undefined;
  /** True when this idempotency key had already settled (no new rows written). */
  reused: boolean;
}

function receiptCodeFor(purchaseId: string): string {
  return `FND-${purchaseId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

/**
 * Postgres unique-violation = SQLSTATE 23505. Drizzle wraps the driver error,
 * so the code can sit on the error OR on its `cause` (the raw postgres-js error).
 */
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 4 && cur && typeof cur === "object"; depth++) {
    if ((cur as { code?: unknown }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/** Find an already-settled purchase by idempotency key, then by payment ref. */
async function findPriorPurchase(
  input: Pick<
    RecordSettlementInput,
    "idempotencyKey" | "provider" | "network" | "paymentReference"
  >,
): Promise<SettlementResult | null> {
  let purchase = (
    await db
      .select()
      .from(purchases)
      .where(eq(purchases.idempotencyKey, input.idempotencyKey))
  )[0];
  if (!purchase) {
    purchase = (
      await db
        .select()
        .from(purchases)
        .where(
          and(
            eq(purchases.provider, input.provider),
            eq(purchases.network, input.network),
            eq(purchases.paymentReference, input.paymentReference),
          ),
        )
    )[0];
  }
  if (!purchase) return null;
  const receipt = (
    await db.select().from(receipts).where(eq(receipts.purchaseId, purchase.id))
  )[0];
  return { purchase, receipt, reused: true };
}

export async function recordSettlement(
  input: RecordSettlementInput,
): Promise<SettlementResult> {
  if (!Number.isInteger(input.grossMicroUsdc) || input.grossMicroUsdc <= 0) {
    throw new Error("recordSettlement: grossMicroUsdc must be a positive integer");
  }

  try {
    return await db.transaction(async (tx) => {
      // 1) Lock the grant first so concurrent same-grant settlements serialize.
      //    Skip entirely when the cap was already RESERVED before settle(): the
      //    reservation validated the grant (active / not expired / room / per-
      //    purchase) and atomically moved the cap, possibly to 'exhausted'. Re-
      //    asserting here would wrongly reject an exact-cap purchase the
      //    reservation just exhausted — so we don't load/assert/decrement it.
      let grant: (typeof buyerSessionGrants.$inferSelect) | undefined;
      if (input.sessionGrantId && !input.capAlreadyReserved) {
        grant = (
          await tx
            .select()
            .from(buyerSessionGrants)
            .where(eq(buyerSessionGrants.id, input.sessionGrantId))
            .for("update")
        )[0];
        if (!grant) throw new SettlementError("grant_not_found");
      }

      // 2) Idempotency pre-check: a prior settlement with this key wins,
      //    BEFORE any cap assertion (the prior settlement already spent it).
      const priorByKey = (
        await tx
          .select()
          .from(purchases)
          .where(eq(purchases.idempotencyKey, input.idempotencyKey))
      )[0];
      if (priorByKey) {
        const priorReceipt = (
          await tx
            .select()
            .from(receipts)
            .where(eq(receipts.purchaseId, priorByKey.id))
        )[0];
        return { purchase: priorByKey, receipt: priorReceipt, reused: true };
      }

      // 3) Now assert the grant guardrails for this NEW settlement.
      if (grant) {
        if (grant.status !== "active")
          throw new SettlementError("grant_not_active");
        if (grant.expiresAt && grant.expiresAt.getTime() <= Date.now())
          throw new SettlementError("grant_expired");
        if (grant.buyerId !== input.buyerId)
          throw new SettlementError("grant_buyer_mismatch");
        if (
          !input.payerAddress ||
          input.payerAddress.toLowerCase() !==
            grant.sessionKeyAddress.toLowerCase()
        )
          throw new SettlementError("payer_not_session_key");
        // cap is enforced by the pre-settle reservation when capAlreadyReserved;
        // re-asserting it here would wrongly read the already-decremented value.
        if (!input.capAlreadyReserved) {
          if (
            grant.perPurchaseCapMicroUsdc != null &&
            input.grossMicroUsdc > grant.perPurchaseCapMicroUsdc
          )
            throw new SettlementError("over_per_purchase_cap");
          if (input.grossMicroUsdc > grant.remainingCapMicroUsdc)
            throw new SettlementError("over_remaining_cap");
        }
      }

      // 4) Resolve the licensable unit + its rights provenance.
      const moment = (
        await tx.select().from(moments).where(eq(moments.id, input.momentId))
      )[0];
      if (!moment) throw new SettlementError("moment_not_found");
      const asset = (
        await tx.select().from(assets).where(eq(assets.id, moment.assetId))
      )[0];
      if (!asset) throw new SettlementError("asset_not_found");

      const split = computeSplit({
        grossMicroUsdc: input.grossMicroUsdc,
        hasFinder: !!input.finderId,
      });

      // 5) Atomic money write. A lost race here throws 23505 → rollback →
      //    recovered below (the grant decrement rolls back with it).
      const [purchase] = await tx
        .insert(purchases)
        .values({
          momentId: moment.id,
          assetId: moment.assetId,
          buyerId: input.buyerId,
          agentRunId: input.agentRunId ?? null,
          curationId: input.curationId ?? null,
          sessionGrantId: input.sessionGrantId ?? null,
          creatorId: moment.creatorId,
          finderId: input.finderId ?? null,
          payerAddress: input.payerAddress ?? null,
          attributionReason: input.attributionReason ?? null,
          curationScore: input.curationScore ?? null,
          grossMicroUsdc: input.grossMicroUsdc,
          creatorMicroUsdc: split.creatorMicroUsdc,
          finderMicroUsdc: split.finderMicroUsdc,
          platformMicroUsdc: split.platformMicroUsdc,
          remainderPolicy: split.remainderPolicy,
          paymentReference: input.paymentReference,
          network: input.network,
          sellerAddress: input.sellerAddress,
          idempotencyKey: input.idempotencyKey,
          provider: input.provider,
          status: "settled",
          settledAt: new Date(),
        })
        .returning();

      const [receipt] = await tx
        .insert(receipts)
        .values({
          purchaseId: purchase.id,
          receiptCode: receiptCodeFor(purchase.id),
          publicSlug: `r-${purchase.id}`,
          momentTitle: moment.title,
          sourceType: asset.sourceType,
          usageType: moment.usageType,
          licenseSummary: moment.licenseSummary,
          attributionText: input.attributionReason,
          creatorId: moment.creatorId,
          finderId: input.finderId ?? null,
          ownershipModel: asset.ownershipModel,
          attestationVersion: asset.attestationVersion,
          attestationText: asset.attestationText,
          attestationAt: asset.attestationAt,
          paymentReference: input.paymentReference,
          network: input.network,
          grossMicroUsdc: input.grossMicroUsdc,
          creatorMicroUsdc: split.creatorMicroUsdc,
          finderMicroUsdc: split.finderMicroUsdc,
          platformMicroUsdc: split.platformMicroUsdc,
          clipStorageKeySnapshot: moment.clipStorageKey,
        })
        .returning();

      // 6) Decrement the grant cap exactly once, atomic with the purchase —
      //    UNLESS the caller already reserved it before settle() (then the cap
      //    was moved atomically up front and must not be decremented twice).
      if (grant && !input.capAlreadyReserved) {
        const newRemaining = grant.remainingCapMicroUsdc - input.grossMicroUsdc;
        await tx
          .update(buyerSessionGrants)
          .set({
            remainingCapMicroUsdc: newRemaining,
            status: newRemaining === 0 ? "exhausted" : grant.status,
            updatedAt: new Date(),
          })
          .where(eq(buyerSessionGrants.id, grant.id));
      }

      return { purchase, receipt, reused: false };
    });
  } catch (err) {
    // Lost the insert race: the winner committed; the aborted tx rolled back
    // (including any grant decrement). Recover the winner's rows as reused.
    if (isUniqueViolation(err)) {
      const recovered = await findPriorPurchase(input);
      if (recovered) return recovered;
    }
    throw err;
  }
}

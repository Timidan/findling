/**
 * Withdrawal service — turns an accrued ledger balance into a real on-chain
 * payout via the provider's withdraw() (seller Gateway balance → recipient).
 * Used by creators AND agent finders to pull their earnings autonomously.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { withdrawals } from "@/server/db/schema";
import { getEarnings } from "./earnings";
import type { WithdrawInput, WithdrawResult } from "@/server/payment/types";

/** Hard server-side cap on payout fee (decimal USDC). Caller cannot exceed it. */
const MAX_FEE_USDC = process.env.WITHDRAW_MAX_FEE_USDC ?? "2.01";

function capMaxFee(requested?: string): string {
  const cap = Number.parseFloat(MAX_FEE_USDC);
  const want = requested != null ? Number.parseFloat(requested) : cap;
  // clamp to [0, cap]: a negative (or non-finite) caller value must never reach
  // the provider, where it would throw and leave a counted in-flight row.
  const fee = Number.isFinite(want) ? Math.max(0, Math.min(want, cap)) : cap;
  return fee.toString();
}

/** Anything that can pay out — MockPaymentProvider or GatewayX402PaymentProvider. */
export interface PayoutProvider {
  readonly name: "gateway_x402" | "mock";
  withdraw(input: WithdrawInput): Promise<WithdrawResult>;
}

export interface RequestWithdrawalInput {
  userId: string;
  role: "creator" | "finder";
  recipientAddress: string;
  network?: string;
  maxFee?: string;
}

export class NothingToWithdrawError extends Error {
  constructor() {
    super("nothing_to_withdraw");
    this.name = "NothingToWithdrawError";
  }
}

export async function requestWithdrawal(
  input: RequestWithdrawalInput,
  provider: PayoutProvider,
) {
  const network = input.network ?? "arcTestnet";
  const maxFee = capMaxFee(input.maxFee);

  // Serialize concurrent withdrawals for this user+role with a transaction-
  // scoped advisory lock, re-derive the balance INSIDE the lock, and insert the
  // 'requested' row before releasing — so two concurrent calls can't both read
  // the full balance and overpay.
  const wd = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`wd:${input.userId}:${input.role}`}))`,
    );
    const earnings = await getEarnings(input.userId, tx);
    const amount =
      input.role === "creator"
        ? earnings.creator.withdrawableMicroUsdc
        : earnings.finder.withdrawableMicroUsdc;
    if (amount <= 0) throw new NothingToWithdrawError();
    const [row] = await tx
      .insert(withdrawals)
      .values({
        recipientUserId: input.userId,
        recipientWalletAddress: input.recipientAddress,
        role: input.role,
        amountMicroUsdc: amount,
        maxFee,
        network,
        provider: provider.name,
        status: "requested",
      })
      .returning();
    return row;
  });

  let res: WithdrawResult;
  try {
    res = await provider.withdraw({
      recipientAddress: input.recipientAddress,
      amountMicroUsdc: wd.amountMicroUsdc,
      network,
      maxFee,
      reference: wd.id,
    });
  } catch (e) {
    // UNKNOWN outcome: the call threw, but the payout MAY have already broadcast.
    // Do NOT mark 'failed' (that would drop it from the counted balance and let
    // the funds be withdrawn again — a double-pay). Hold it as 'submitted' so it
    // stays counted against the balance until reconciled against the provider/tx.
    await db
      .update(withdrawals)
      .set({
        status: "submitted",
        failureReason: `unknown_outcome (held for reconciliation): ${
          e instanceof Error ? e.message : String(e)
        }`,
        updatedAt: new Date(),
      })
      .where(eq(withdrawals.id, wd.id));
    throw e;
  }

  if (!res.ok) {
    // CLEAN rejection from the provider — no funds moved, so the cap can be freed.
    const [failed] = await db
      .update(withdrawals)
      .set({ status: "failed", failureReason: res.reason, updatedAt: new Date() })
      .where(eq(withdrawals.id, wd.id))
      .returning();
    return failed;
  }

  if (!res.transactionHash) {
    // Provider reported success but returned NO tx hash — we can't prove the
    // payout. Recording 'succeeded' would assert an unverifiable payout; instead
    // hold it as 'submitted' (still counted, so not double-payable) and surface it
    // for reconciliation, exactly like an unknown-outcome throw.
    const [held] = await db
      .update(withdrawals)
      .set({
        status: "submitted",
        gatewayWithdrawReference: res.providerReference ?? null,
        failureReason:
          "unknown_outcome (provider ok but missing tx hash). Held for reconciliation.",
        updatedAt: new Date(),
      })
      .where(eq(withdrawals.id, wd.id))
      .returning();
    return held;
  }

  const [succeeded] = await db
    .update(withdrawals)
    .set({
      status: "succeeded",
      transactionHash: res.transactionHash,
      gatewayWithdrawReference: res.providerReference,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(withdrawals.id, wd.id))
    .returning();
  return succeeded;
}

export interface SubmittedWithdrawal {
  id: string;
  recipientUserId: string;
  role: "creator" | "finder";
  amountMicroUsdc: number;
  recipientWalletAddress: string;
  failureReason: string | null;
  createdAt: Date;
}

/**
 * RECONCILIATION (resolves the "funds locked in 'submitted'" hazard): list every
 * withdrawal stuck in `submitted` — an UNKNOWN on-chain outcome that stays counted
 * against the user's balance (so it can't be double-paid) until an operator/job
 * confirms what really happened on-chain. Drive this with reconcileSubmittedWithdrawal.
 */
export async function listSubmittedWithdrawals(): Promise<SubmittedWithdrawal[]> {
  const rows = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.status, "submitted"));
  return rows.map((w) => ({
    id: w.id,
    recipientUserId: w.recipientUserId,
    role: w.role as "creator" | "finder",
    amountMicroUsdc: w.amountMicroUsdc,
    recipientWalletAddress: w.recipientWalletAddress,
    failureReason: w.failureReason ?? null,
    createdAt: w.createdAt,
  }));
}

/**
 * Resolve a `submitted` (unknown-outcome) withdrawal once its REAL on-chain
 * status is known — the missing reconciliation path the original code only
 * promised in a comment. Verify on-chain FIRST, then:
 *   - "succeeded" (+ the tx hash): keep it counted, record the proof.
 *   - "failed": frees the balance for re-withdrawal — use ONLY when you have
 *     confirmed that NO transfer occurred (otherwise you enable a double-pay).
 * Guarded: only acts on a row still in `submitted`; returns null otherwise (so
 * two reconcilers can't both flip the same row).
 */
export async function reconcileSubmittedWithdrawal(input: {
  withdrawalId: string;
  outcome: "succeeded" | "failed";
  transactionHash?: string;
  note?: string;
}) {
  // A 'succeeded' verdict MUST carry on-chain proof — never record an
  // unverifiable success (the script enforces this too, but guard here so any
  // caller is safe).
  if (input.outcome === "succeeded" && !input.transactionHash?.trim()) {
    throw new Error(
      "reconcileSubmittedWithdrawal: a transactionHash is required to mark a withdrawal succeeded.",
    );
  }
  const set =
    input.outcome === "succeeded"
      ? {
          status: "succeeded" as const,
          transactionHash: input.transactionHash ?? null,
          gatewayWithdrawReference: input.transactionHash ?? null,
          failureReason: input.note ? `reconciled_succeeded: ${input.note}` : null,
          completedAt: new Date(),
          updatedAt: new Date(),
        }
      : {
          status: "failed" as const,
          failureReason: `reconciled_failed: ${input.note ?? "confirmed no transfer occurred"}`,
          updatedAt: new Date(),
        };
  const [row] = await db
    .update(withdrawals)
    .set(set)
    .where(
      and(eq(withdrawals.id, input.withdrawalId), eq(withdrawals.status, "submitted")),
    )
    .returning();
  return row ?? null;
}

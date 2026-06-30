/**
 * Earnings derivation — a participant's (creator or finder, human or agent)
 * accrued / withdrawn / withdrawable balance, derived from the settled-purchase
 * split ledger minus on-chain withdrawals. Money is integer micro-USDC.
 *
 * "Credited immediately in the ledger, withdrawn on-chain on demand."
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { purchases, withdrawals } from "@/server/db/schema";

/** db or an open transaction — getEarnings can run inside a locked tx. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface RoleEarnings {
  accruedMicroUsdc: number;
  withdrawnMicroUsdc: number;
  withdrawableMicroUsdc: number;
}

export interface Earnings {
  userId: string;
  creator: RoleEarnings;
  finder: RoleEarnings;
  /** Total withdrawable across both roles. */
  totalWithdrawableMicroUsdc: number;
}

// withdrawals that should count against the balance (in-flight or done).
// Exported as the single source of truth so the transactions ledger's running
// balance reconciles with getEarnings() and the two can never drift apart.
export const COUNTED_WITHDRAWAL_STATUSES = [
  "requested",
  "submitted",
  "succeeded",
] as const;

async function sumColumn(
  exec: Executor,
  column: typeof purchases.creatorMicroUsdc,
  whereExpr: ReturnType<typeof eq>,
): Promise<number> {
  const [row] = await exec
    .select({ total: sql<number>`coalesce(sum(${column}), 0)` })
    .from(purchases)
    .where(whereExpr);
  return Number(row?.total ?? 0);
}

async function sumWithdrawn(
  exec: Executor,
  userId: string,
  role: "creator" | "finder",
): Promise<number> {
  const [row] = await exec
    .select({ total: sql<number>`coalesce(sum(${withdrawals.amountMicroUsdc}), 0)` })
    .from(withdrawals)
    .where(
      and(
        eq(withdrawals.recipientUserId, userId),
        eq(withdrawals.role, role),
        inArray(withdrawals.status, [...COUNTED_WITHDRAWAL_STATUSES]),
      ),
    );
  return Number(row?.total ?? 0);
}

export async function getEarnings(
  userId: string,
  exec: Executor = db,
): Promise<Earnings> {
  // accrued: settled purchases where this user is the creator / finder.
  // Run all four aggregates concurrently — on a remote pooled DB (~200ms/round
  // trip) sequential awaits cost ~800ms; parallel collapses that to ~one trip.
  const [creatorAccrued, finderAccrued, creatorWithdrawn, finderWithdrawn] =
    await Promise.all([
      sumColumn(
        exec,
        purchases.creatorMicroUsdc,
        and(eq(purchases.creatorId, userId), eq(purchases.status, "settled"))!,
      ),
      sumColumn(
        exec,
        purchases.finderMicroUsdc,
        and(eq(purchases.finderId, userId), eq(purchases.status, "settled"))!,
      ),
      sumWithdrawn(exec, userId, "creator"),
      sumWithdrawn(exec, userId, "finder"),
    ]);

  const creator: RoleEarnings = {
    accruedMicroUsdc: creatorAccrued,
    withdrawnMicroUsdc: creatorWithdrawn,
    withdrawableMicroUsdc: Math.max(0, creatorAccrued - creatorWithdrawn),
  };
  const finder: RoleEarnings = {
    accruedMicroUsdc: finderAccrued,
    withdrawnMicroUsdc: finderWithdrawn,
    withdrawableMicroUsdc: Math.max(0, finderAccrued - finderWithdrawn),
  };

  // withdrawable is clamped at 0 so the UI never shows a negative balance, but a
  // clamp would also HIDE real drift (withdrawn > accrued should be impossible).
  // Surface it loudly instead of swallowing it.
  if (creatorAccrued < creatorWithdrawn || finderAccrued < finderWithdrawn) {
    console.warn(
      `[earnings] ledger drift for user ${userId}: creator accrued=${creatorAccrued} ` +
        `withdrawn=${creatorWithdrawn}; finder accrued=${finderAccrued} withdrawn=${finderWithdrawn} ` +
        `(withdrawable clamped to 0 — investigate)`,
    );
  }

  return {
    userId,
    creator,
    finder,
    totalWithdrawableMicroUsdc:
      creator.withdrawableMicroUsdc + finder.withdrawableMicroUsdc,
  };
}

/**
 * Buyer Session Grant spend Module.
 *
 * Reservation happens before irreversible settlement so concurrent License
 * Purchases cannot exceed a grant cap. Release happens only when the caller
 * knows funds did not move, or when an idempotent replay created a duplicate
 * reservation that must be returned.
 */
import { and, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { buyerSessionGrants } from "@/server/db/schema";

/**
 * Atomically reserve `amount` from a grant's remaining cap before settlement.
 * Returns true iff the grant was active, unexpired, within remaining cap, and
 * within per-purchase cap.
 */
export async function reserveGrantCap(
  grantId: string,
  amount: number,
): Promise<boolean> {
  const rows = await db
    .update(buyerSessionGrants)
    .set({
      remainingCapMicroUsdc: sql`${buyerSessionGrants.remainingCapMicroUsdc} - ${amount}`,
      status: sql`CASE WHEN ${buyerSessionGrants.remainingCapMicroUsdc} - ${amount} = 0 THEN 'exhausted' ELSE ${buyerSessionGrants.status} END`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(buyerSessionGrants.id, grantId),
        eq(buyerSessionGrants.status, "active"),
        or(
          isNull(buyerSessionGrants.expiresAt),
          gt(buyerSessionGrants.expiresAt, sql`now()`),
        ),
        gte(buyerSessionGrants.remainingCapMicroUsdc, amount),
        or(
          isNull(buyerSessionGrants.perPurchaseCapMicroUsdc),
          gte(buyerSessionGrants.perPurchaseCapMicroUsdc, amount),
        ),
      ),
    )
    .returning({ id: buyerSessionGrants.id });
  return rows.length === 1;
}

/**
 * Release a previously reserved amount back to the grant.
 *
 * Never call this when settlement threw: funds may have moved, so the reserved
 * cap must stay in place until reconciliation.
 */
export async function releaseGrantCap(
  grantId: string,
  amount: number,
): Promise<void> {
  await db
    .update(buyerSessionGrants)
    .set({
      remainingCapMicroUsdc: sql`${buyerSessionGrants.remainingCapMicroUsdc} + ${amount}`,
      status: sql`CASE WHEN ${buyerSessionGrants.status} = 'exhausted' THEN 'active' ELSE ${buyerSessionGrants.status} END`,
      updatedAt: new Date(),
    })
    .where(eq(buyerSessionGrants.id, grantId));
}

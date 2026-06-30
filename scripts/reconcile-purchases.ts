/**
 * Reconcile purchase reservations stuck in 'pending' after an x402 settle
 * exception or post-settle guardrail.
 *
 * The reservation keeps the buyer grant cap held until the real payment outcome
 * is known. Verify the Gateway/chain outcome FIRST, then resolve:
 *
 *   list:    node --env-file=.env.local --import tsx scripts/reconcile-purchases.ts
 *   settled: node --env-file=.env.local --import tsx scripts/reconcile-purchases.ts <reservationId-or-paymentHash> settled <paymentReference> <network> <payerAddress> "<note>"
 *   failed:  node --env-file=.env.local --import tsx scripts/reconcile-purchases.ts <reservationId-or-paymentHash> not_settled "<note>"
 *
 * Mark 'not_settled' ONLY when you have confirmed that no payment settled for
 * this reservation. That releases the held grant cap.
 */
import {
  listPendingPurchaseReservations,
  reconcilePendingPurchaseReservation,
} from "../src/server/license-purchase/purchase-reservation";

async function main() {
  const [target, outcome, third, fourth, fifth, ...rest] = process.argv.slice(2);

  if (!target) {
    const rows = await listPendingPurchaseReservations();
    if (rows.length === 0) {
      console.log("No purchase reservations awaiting reconciliation.");
      return;
    }
    console.log(
      `${rows.length} purchase reservation(s) pending (grant cap held until resolved):\n`,
    );
    for (const r of rows) {
      console.log(
        `- ${r.id}  status=${r.status}  amount=${r.amountMicroUsdc}µUSDC  grant=${r.sessionGrantId}  moment=${r.momentId}  since=${r.createdAt.toISOString()}\n  paymentHeaderHash: ${r.paymentHeaderHash}\n  payer: ${r.payerAddress}\n  reason: ${r.failureReason ?? "(none)"}`,
      );
    }
    console.log(
      '\nResolve one after checking Gateway/chain:\n  <id-or-hash> settled <paymentReference> <network> <payerAddress> "<note>"\n  <id-or-hash> not_settled "<note>"',
    );
    return;
  }

  if (outcome !== "settled" && outcome !== "not_settled") {
    console.error("Second arg must be 'settled' or 'not_settled'.");
    process.exit(1);
  }

  const rows = await listPendingPurchaseReservations();
  const reservation = rows.find(
    (r) => r.id === target || r.paymentHeaderHash === target,
  );
  if (!reservation) {
    console.error(
      `No pending purchase reservation with id/hash ${target} (already resolved?).`,
    );
    process.exit(1);
  }

  if (outcome === "settled") {
    if (!third || !fourth || !fifth) {
      console.error(
        "settled requires <paymentReference> <network> <payerAddress>.",
      );
      process.exit(1);
    }
    const row = await reconcilePendingPurchaseReservation({
      reservationId: reservation.id,
      outcome,
      paymentReference: third,
      network: fourth,
      payerAddress: fifth,
      note: rest.join(" ") || undefined,
    });
    if (!row) {
      console.error(`Reservation ${reservation.id} was not pending.`);
      process.exit(1);
    }
    console.log(`Resolved ${reservation.id} -> ${row.status}.`);
    return;
  }

  const row = await reconcilePendingPurchaseReservation({
    reservationId: reservation.id,
    outcome,
    note: third,
  });
  if (!row) {
    console.error(`Reservation ${reservation.id} was not pending.`);
    process.exit(1);
  }
  console.log(`Resolved ${reservation.id} -> ${row.status}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

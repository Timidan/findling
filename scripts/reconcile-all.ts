/**
 * On-call triage: list EVERYTHING stuck awaiting reconciliation in one shot.
 *
 * A thin, READ-ONLY wrapper over the two per-queue listers so an operator can
 * answer "is anything stranded right now?" with a single command:
 *
 *   node --env-file=.env.local --import tsx scripts/reconcile-all.ts
 *
 * It lists both queues; it never resolves anything. Resolving money REQUIRES
 * verifying the real on-chain / Gateway outcome first, so it stays a deliberate
 * per-item step in the dedicated scripts:
 *
 *   withdrawals stuck in 'submitted':
 *     node --env-file=.env.local --import tsx scripts/reconcile-withdrawals.ts <id> succeeded <txHash>
 *     node --env-file=.env.local --import tsx scripts/reconcile-withdrawals.ts <id> failed "<note>"
 *
 *   purchase reservations stuck in 'pending':
 *     node --env-file=.env.local --import tsx scripts/reconcile-purchases.ts <id-or-hash> settled <ref> <network> <payer> "<note>"
 *     node --env-file=.env.local --import tsx scripts/reconcile-purchases.ts <id-or-hash> not_settled "<note>"
 *
 * Exit code is 0 when both queues are empty, 2 when either has stuck rows — so a
 * cron/monitor can alert on a non-zero exit without parsing stdout.
 */
import { listSubmittedWithdrawals } from "../src/server/ledger/withdrawal";
import { listPendingPurchaseReservations } from "../src/server/license-purchase/purchase-reservation";

async function main() {
  const [withdrawals, reservations] = await Promise.all([
    listSubmittedWithdrawals(),
    listPendingPurchaseReservations(),
  ]);

  if (withdrawals.length === 0) {
    console.log("Withdrawals: none in 'submitted' (nothing stranded).");
  } else {
    console.log(
      `Withdrawals: ${withdrawals.length} in 'submitted' (balance held until resolved):`,
    );
    for (const r of withdrawals) {
      console.log(
        `- ${r.id}  role=${r.role}  amount=${r.amountMicroUsdc}µUSDC  to=${r.recipientWalletAddress}  since=${r.createdAt.toISOString()}\n  reason: ${r.failureReason ?? "(none)"}`,
      );
    }
    console.log(
      "  Resolve after checking the chain:\n    scripts/reconcile-withdrawals.ts <id> succeeded <txHash>\n    scripts/reconcile-withdrawals.ts <id> failed \"<note>\"",
    );
  }

  console.log("");

  if (reservations.length === 0) {
    console.log("Purchase reservations: none 'pending' (nothing stranded).");
  } else {
    console.log(
      `Purchase reservations: ${reservations.length} 'pending' (grant cap held until resolved):`,
    );
    for (const r of reservations) {
      console.log(
        `- ${r.id}  status=${r.status}  amount=${r.amountMicroUsdc}µUSDC  grant=${r.sessionGrantId}  moment=${r.momentId}  since=${r.createdAt.toISOString()}\n  paymentHeaderHash: ${r.paymentHeaderHash}\n  payer: ${r.payerAddress}\n  reason: ${r.failureReason ?? "(none)"}`,
      );
    }
    console.log(
      "  Resolve after checking Gateway/chain:\n    scripts/reconcile-purchases.ts <id-or-hash> settled <ref> <network> <payer> \"<note>\"\n    scripts/reconcile-purchases.ts <id-or-hash> not_settled \"<note>\"",
    );
  }

  return withdrawals.length + reservations.length > 0 ? 2 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

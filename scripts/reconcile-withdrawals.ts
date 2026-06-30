/**
 * Reconcile withdrawals stuck in 'submitted' (unknown on-chain outcome).
 *
 * When provider.withdraw() throws without a confirmed result, the row is held as
 * 'submitted' and keeps counting against the user's balance — correct (never
 * double-pay), but it strands the funds until someone confirms what happened
 * on-chain. This is that confirmation step.
 *
 *   list:    node --env-file=.env.local --import tsx scripts/reconcile-withdrawals.ts
 *   resolve: node --env-file=.env.local --import tsx scripts/reconcile-withdrawals.ts <id> succeeded <txHash>
 *            node --env-file=.env.local --import tsx scripts/reconcile-withdrawals.ts <id> failed "<note>"
 *
 * VERIFY THE REAL ON-CHAIN OUTCOME FIRST. Mark 'failed' (which frees the balance
 * for re-withdrawal) ONLY when you have confirmed that NO transfer occurred.
 */
import {
  listSubmittedWithdrawals,
  reconcileSubmittedWithdrawal,
} from "../src/server/ledger/withdrawal";

async function main() {
  const [id, outcome, extra] = process.argv.slice(2);

  if (!id) {
    const rows = await listSubmittedWithdrawals();
    if (rows.length === 0) {
      console.log("No withdrawals awaiting reconciliation.");
      return;
    }
    console.log(
      `${rows.length} withdrawal(s) in 'submitted' (balance held until resolved):\n`,
    );
    for (const r of rows) {
      console.log(
        `- ${r.id}  role=${r.role}  amount=${r.amountMicroUsdc}µUSDC  to=${r.recipientWalletAddress}  since=${r.createdAt.toISOString()}\n  reason: ${r.failureReason ?? "(none)"}`,
      );
    }
    console.log(
      '\nResolve one after checking the chain:\n  <id> succeeded <txHash>   (confirmed paid)\n  <id> failed "<note>"      (confirmed NO transfer — frees the balance)',
    );
    return;
  }

  if (outcome !== "succeeded" && outcome !== "failed") {
    console.error("Second arg must be 'succeeded' or 'failed'.");
    process.exit(1);
  }
  if (outcome === "succeeded" && !extra) {
    console.error("A transaction hash is required when marking 'succeeded'.");
    process.exit(1);
  }

  const row = await reconcileSubmittedWithdrawal({
    withdrawalId: id,
    outcome,
    transactionHash: outcome === "succeeded" ? extra : undefined,
    note: outcome === "failed" ? extra : undefined,
  });
  if (!row) {
    console.error(`No 'submitted' withdrawal with id ${id} (already resolved?).`);
    process.exit(1);
  }
  console.log(`Resolved ${id} -> ${row.status}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

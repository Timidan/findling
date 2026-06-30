import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowSquareOut,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";
import type { LedgerEntry, TransactionLedger } from "@/server/catalog/studio";
import { UsdcIcon } from "@/components/brand/usdc";
import { TxLink, AddressLink } from "@/components/brand/onchain";
import { formatDateTime, formatUsdc } from "@/lib/format";

/**
 * The wallet-activity view: one reverse-chronological ledger interleaving license
 * credits (money in, +) and Arc payouts (money out, −) with a running balance.
 * Every on-chain row links to the explorer by tx hash; every license credit links
 * to its public receipt — so each line is verifiable, not just a number.
 */
export function TransactionLedgerView({
  ledger,
  payoutWalletAddress,
}: {
  ledger: TransactionLedger;
  payoutWalletAddress: string | null;
}) {
  if (ledger.entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-secondary text-sage">
          <Wallet weight="duotone" aria-hidden className="size-5" />
        </span>
        <p className="text-sm font-medium">No transactions yet</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          License credits and on-chain payouts will appear here, newest first,
          against a running balance.
        </p>
        {payoutWalletAddress && (
          <AddressLink
            address={payoutWalletAddress}
            prefix="View your payout wallet"
            className="mt-1 text-xs text-muted-foreground"
          />
        )}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {ledger.entries.map((e) => (
        <Row key={e.id} e={e} />
      ))}
    </div>
  );
}

function Row({ e }: { e: LedgerEntry }) {
  const isCredit = e.kind === "license";
  const amount = Math.abs(e.signedMicroUsdc) / 1_000_000;
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 sm:gap-4 sm:px-5">
      <span
        className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${
          isCredit ? "bg-sage/15 text-sage" : "bg-secondary text-foreground"
        }`}
      >
        {isCredit ? (
          <ArrowDownLeft weight="bold" aria-hidden className="size-4" />
        ) : (
          <ArrowUpRight weight="bold" aria-hidden className="size-4" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate capitalize">{e.label}</span>
          <StatusPill status={e.status} />
        </p>
        <div className="tabular mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="capitalize">
            {isCredit
              ? `${e.role === "both" ? "creator + finder" : e.role} ${
                  e.viaAgent ? "· agent license" : "license"
                }`
              : "to Arc wallet"}
          </span>
          <span className="size-0.5 rounded-full bg-border" />
          <span>{formatDateTime(e.at)}</span>
          <Proof e={e} />
        </div>
      </div>

      <div className="shrink-0 text-right">
        <span
          className={`tabular inline-flex items-center justify-end gap-1 text-sm font-semibold ${
            isCredit ? "text-sage" : "text-foreground"
          }`}
        >
          {isCredit ? "+" : "−"}
          {formatUsdc(amount)}
          <UsdcIcon size="0.8em" />
        </span>
        <p className="tabular mt-0.5 text-[0.7rem] text-muted-foreground">
          bal {formatUsdc(e.balanceMicroUsdc / 1_000_000)} USDC
        </p>
      </div>
    </div>
  );
}

/** The verify affordance for a row: explorer tx (payout) or receipt (license). */
function Proof({ e }: { e: LedgerEntry }) {
  if (e.kind === "withdrawal") {
    if (e.transactionHash) {
      return (
        <>
          <span className="size-0.5 rounded-full bg-border" />
          <TxLink hash={e.transactionHash} />
        </>
      );
    }
    if (e.status === "failed") return null;
    return (
      <>
        <span className="size-0.5 rounded-full bg-border" />
        <span className="text-muted-foreground/80">awaiting tx hash</span>
      </>
    );
  }
  if (e.receiptSlug) {
    return (
      <>
        <span className="size-0.5 rounded-full bg-border" />
        <Link
          href={`/r/${e.receiptSlug}`}
          className="inline-flex items-center gap-1 underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          receipt
          <ArrowSquareOut weight="bold" aria-hidden className="size-3" />
        </Link>
      </>
    );
  }
  return null;
}

function StatusPill({ status }: { status: LedgerEntry["status"] }) {
  const settled = status === "settled" || status === "succeeded";
  const failed = status === "failed";
  const label = settled ? "settled" : failed ? "failed" : "pending";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-wider ${
        settled
          ? "bg-sage/15 text-sage"
          : failed
            ? "bg-destructive/10 text-destructive"
            : "bg-secondary text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}

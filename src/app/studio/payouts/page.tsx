import Link from "next/link";
import {
  Wallet,
  FilmSlate,
  Sparkle,
  Receipt,
} from "@phosphor-icons/react/dist/ssr";
import {
  getStudioIdentity,
  getTransactionLedger,
} from "@/server/catalog/studio";
import { getCurrentUserId } from "@/server/auth/current-user";
import { getEarnings, type RoleEarnings } from "@/server/ledger/earnings";
import { UsdcIcon } from "@/components/brand/usdc";
import { AddressLink } from "@/components/brand/onchain";
import { NetworkBadge } from "@/components/brand/network-badge";
import { WithdrawButton } from "@/components/earnings/withdraw-button";
import { TransactionLedgerView } from "@/components/studio/transaction-ledger";
import { StudioAuthGate } from "@/components/studio/studio-auth-gate";
import { formatMicroUsdc } from "@/lib/format";

export const dynamic = "force-dynamic"; // live ledger + signed actions

export default async function PayoutsPage() {
  // payouts are private — only the logged-in user's own balance
  const id = await getCurrentUserId();
  const identity = id ? await getStudioIdentity(id).catch(() => null) : null;

  if (!identity) {
    return (
      <StudioAuthGate message="Sign in with your wallet to view and withdraw your balance." />
    );
  }

  const [earnings, ledger] = await Promise.all([
    getEarnings(identity.id),
    getTransactionLedger(identity.id),
  ]);

  const hasPayoutWallet = !!identity.payoutWalletAddress;
  const roles: {
    key: "creator" | "finder";
    title: string;
    icon: React.ReactNode;
    data: RoleEarnings;
  }[] = [
    {
      key: "creator",
      title: "Creator payout",
      icon: <FilmSlate weight="duotone" className="size-4" />,
      data: earnings.creator,
    },
    {
      key: "finder",
      title: "Finder payout",
      icon: <Sparkle weight="duotone" className="size-4" />,
      data: earnings.finder,
    },
  ];
  const payable = roles.filter((r) => r.data.withdrawableMicroUsdc > 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:py-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Payouts
            </p>
            <NetworkBadge />
          </div>
          <h1 className="mt-2 break-words font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl">
            Withdraw to Arc
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Wallet weight="duotone" className="size-3.5 text-sage" />
            {identity.payoutWalletAddress ? (
              <AddressLink
                address={identity.payoutWalletAddress}
                prefix="payout wallet"
              />
            ) : (
              <Link
                href="/studio/settings"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                set a payout wallet →
              </Link>
            )}
          </p>
        </div>

        {/* withdrawable now */}
        <div className="rounded-2xl border border-border bg-card px-5 py-4 sm:shrink-0">
          <p className="text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
            Withdrawable now
          </p>
          <p className="tabular mt-1 flex items-center gap-1.5 text-2xl font-semibold text-foreground sm:text-3xl">
            {/* from the SAME snapshot as the ledger so the headline always equals
                the top row's running balance, even under a concurrent write */}
            {formatMicroUsdc(ledger.endingBalanceMicroUsdc)}
            <UsdcIcon size="0.7em" />
            <span className="ml-0.5 text-sm font-normal text-muted-foreground">
              USDC
            </span>
          </p>
        </div>
      </div>

      {/* per-role withdraw actions */}
      <section className="mt-8">
        <h2 className="mb-3 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          Balances
        </h2>
        {payable.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-6 text-sm text-muted-foreground">
            Nothing to withdraw yet. Earnings appear when people or agents use
            your clips, then you can move them to your wallet here.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {payable.map((r) => (
              <div
                key={r.key}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-sage">
                      {r.icon}
                    </span>
                    {r.title}
                  </p>
                  <p className="tabular mt-2 inline-flex items-center gap-1 text-xl font-semibold text-foreground">
                    {formatMicroUsdc(r.data.withdrawableMicroUsdc)}
                    <UsdcIcon size="0.7em" />
                  </p>
                </div>
                <WithdrawButton
                  role={r.key}
                  withdrawableMicroUsdc={r.data.withdrawableMicroUsdc}
                  hasPayoutWallet={hasPayoutWallet}
                  label="Withdraw"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* unified transactions feed (money in + money out, running balance) */}
      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          Transactions
          <span className="font-normal normal-case tracking-normal text-muted-foreground/70">
            money in · payouts on-chain
          </span>
        </h2>
        <TransactionLedgerView
          ledger={ledger}
          payoutWalletAddress={identity.payoutWalletAddress}
        />
      </section>

      <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <Receipt weight="duotone" className="size-4 text-sage" />
        Earnings settle instantly in the ledger. Each payout moves on-chain to
        your Arc wallet. Open any tx to verify it on the explorer.
      </p>
    </div>
  );
}

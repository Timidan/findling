import Link from "next/link";
import {
  Wallet,
  FilmSlate,
  Sparkle,
  ArrowRight,
  Receipt,
} from "@phosphor-icons/react/dist/ssr";
import {
  getStudioIdentity,
  studioHandle,
  getRecentLicenses,
} from "@/server/catalog/studio";
import { getCurrentUserId } from "@/server/auth/current-user";
import { getEarnings, type RoleEarnings } from "@/server/ledger/earnings";
import { UsdcIcon } from "@/components/brand/usdc";
import { AddressLink } from "@/components/brand/onchain";
import { NetworkBadge } from "@/components/brand/network-badge";
import { RecentLicenses } from "@/components/studio/recent-licenses";
import { formatMicroUsdc } from "@/lib/format";

export const dynamic = "force-dynamic"; // live ledger

export default async function EarningsPage() {
  // money is private — only the logged-in user's own ledger, never a fallback
  const id = await getCurrentUserId();
  const identity = id ? await getStudioIdentity(id).catch(() => null) : null;

  if (!identity) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-5 py-24 text-center">
        <Wallet weight="duotone" className="size-9 text-sage" />
        <h1 className="font-display text-3xl tracking-tight">
          Connect your wallet
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in with your wallet to view USDC you have earned.
        </p>
      </div>
    );
  }

  const [earnings, recentLicenses] = await Promise.all([
    getEarnings(identity.id),
    getRecentLicenses(identity.id),
  ]);
  const displayName = studioHandle(identity);
  const totalAccrued =
    earnings.creator.accruedMicroUsdc + earnings.finder.accruedMicroUsdc;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:py-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Earnings
            </p>
            <NetworkBadge />
          </div>
          <h1 className="mt-2 break-words font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl">
            {displayName}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>{identity.email}</span>
            <span className="size-1 rounded-full bg-border" />
            <span className="inline-flex items-center gap-1">
              <Wallet weight="duotone" className="size-3.5 text-sage" />
              {identity.payoutWalletAddress ? (
                <AddressLink
                  address={identity.payoutWalletAddress}
                  prefix="payout"
                />
              ) : (
                "no payout wallet"
              )}
            </span>
          </p>
        </div>
      </div>

      {/* headline money */}
      <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
        <Headline label="Lifetime accrued" micro={totalAccrued} />
        <Headline
          label="Withdrawable now"
          micro={earnings.totalWithdrawableMicroUsdc}
          cta
        />
      </div>

      {/* role ledgers (data only — withdraw lives on Payouts) */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <RoleLedger
          icon={<FilmSlate weight="duotone" className="size-5" />}
          title="As a creator"
          blurb="80% when people or agents use clips you publish."
          data={earnings.creator}
        />
        <RoleLedger
          icon={<Sparkle weight="duotone" className="size-5" />}
          title="As a finder"
          blurb="12% when an agent uses a clip you surfaced."
          data={earnings.finder}
        />
      </div>

      <RecentLicenses licenses={recentLicenses} />

      <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Receipt weight="duotone" className="size-4 text-sage" />
        Credited instantly in the ledger · withdrawn on-chain on demand.
        <Link
          href="/studio/payouts"
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          Go to Payouts
          <ArrowRight weight="bold" className="size-3" />
        </Link>
      </p>
    </div>
  );
}

function Headline({
  label,
  micro,
  cta,
}: {
  label: string;
  micro: number;
  cta?: boolean;
}) {
  const inner = (
    <div className="bg-card px-5 py-5">
      <p className="text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="tabular mt-1.5 flex items-center gap-1.5 text-3xl font-semibold text-foreground sm:text-4xl">
        {formatMicroUsdc(micro)}
        <UsdcIcon size="0.7em" />
      </p>
      {cta && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          Withdraw to your wallet
          <ArrowRight weight="bold" className="size-3" />
        </p>
      )}
    </div>
  );
  return cta ? (
    <Link href="/studio/payouts" className="transition-opacity hover:opacity-90">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function RoleLedger({
  icon,
  title,
  blurb,
  data,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  data: RoleEarnings;
}) {
  const empty = data.accruedMicroUsdc === 0;
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sage">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-2xl leading-none tracking-tight">
            {title}
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{blurb}</p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4">
        <Stat label="Accrued" micro={data.accruedMicroUsdc} muted={empty} />
        <Stat label="Withdrawn" micro={data.withdrawnMicroUsdc} muted />
        <Stat
          label="Withdrawable"
          micro={data.withdrawableMicroUsdc}
          muted={data.withdrawableMicroUsdc === 0}
        />
      </dl>
    </div>
  );
}

function Stat({
  label,
  micro,
  muted,
}: {
  label: string;
  micro: number;
  muted?: boolean;
}) {
  return (
    <div>
      <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`tabular mt-1 inline-flex items-center gap-1 text-base font-semibold ${
          muted ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {formatMicroUsdc(micro)}
        <UsdcIcon size="0.8em" />
      </dd>
    </div>
  );
}

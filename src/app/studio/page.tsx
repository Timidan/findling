import Link from "next/link";
import {
  YoutubeLogo,
  ArrowRight,
  FilmSlate,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";
import {
  getStudioData,
  getRecentLicenses,
  studioHandle,
} from "@/server/catalog/studio";
import { getCurrentUserId } from "@/server/auth/current-user";
import { getEarnings } from "@/server/ledger/earnings";
import { formatMicroUsdc } from "@/lib/format";
import { UsdcIcon } from "@/components/brand/usdc";
import {
  MomentCard,
  ImportCta,
  StudioEmpty,
} from "@/components/studio/moment-card";
import { RecentLicenses } from "@/components/studio/recent-licenses";

export const dynamic = "force-dynamic"; // signed URLs + live catalog

export default async function StudioHome() {
  // The studio shows the SIGNED-IN creator's own catalog + money. Logged out it
  // does NOT preview a default account — it prompts to connect a wallet.
  const sessionId = await getCurrentUserId();
  const [data, earnings, recentLicenses] = await Promise.all([
    sessionId ? getStudioData(sessionId, false) : Promise.resolve(null),
    sessionId ? getEarnings(sessionId) : Promise.resolve(null),
    sessionId ? getRecentLicenses(sessionId) : Promise.resolve([]),
  ]);

  if (!sessionId) {
    return (
      <Container>
        <PageHead eyebrow="Overview" title="Your studio" />
        <div className="mt-8">
          <StudioSignedOut />
        </div>
      </Container>
    );
  }
  if (!data) {
    return (
      <Container>
        <PageHead eyebrow="Overview" title="Creator studio" />
        <div className="mt-8">
          <StudioEmpty />
        </div>
      </Container>
    );
  }

  const { creator, moments, publishedCount, earnedMicroUsdc } = data;
  const displayName = studioHandle(creator);
  const totalUses = moments.reduce((n, m) => n + m.licenses, 0);
  const withdrawable = earnings?.creator.withdrawableMicroUsdc ?? 0;
  const recent = moments.slice(0, 4);

  return (
    <Container>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Overview
          </p>
          <h1 className="mt-2 break-words font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl">
            {displayName}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Upload clips, publish them, and earn when people or agents use them.
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>{moments.length} {moments.length === 1 ? "clip" : "clips"}</span>
            <span className="size-1 rounded-full bg-border" />
            <span>{publishedCount} live {publishedCount === 1 ? "clip" : "clips"}</span>
            {creator.youtubeChannelTitle && (
              <>
                <span className="size-1 rounded-full bg-border" />
                <span className="inline-flex items-center gap-1">
                  <YoutubeLogo weight="fill" className="size-3.5 text-sage" />
                  {creator.youtubeChannelTitle}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ImportCta />
        </div>
      </div>

      {/* metric strip — dividers, not boxes. Money only for the signed-in owner. */}
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
        <Metric label="Clips" value={String(moments.length)} sub={`${publishedCount} live`} />
        <Metric label="Clip uses" value={String(totalUses)} sub="paid on Arc" />
        {earnings ? (
          <>
            <Metric label="Lifetime earned" micro={earnedMicroUsdc} />
            <Metric label="Withdrawable" micro={withdrawable} href="/studio/payouts" />
          </>
        ) : (
          <div className="col-span-2 flex flex-col justify-center bg-card px-4 py-4">
            <p className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
              Earnings
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Connect your wallet to view your earnings.
            </p>
          </div>
        )}
      </dl>

      <section className="mt-10">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            Recent clips
          </h2>
          {moments.length > recent.length && (
            <Link
              href="/studio/clips"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              All clips
              <ArrowRight weight="bold" className="size-3.5" />
            </Link>
          )}
        </div>
        {moments.length === 0 ? (
          <StudioEmpty />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.map((m) => (
              <MomentCard key={m.momentId} m={m} showEarned={!!sessionId} />
            ))}
          </div>
        )}
      </section>
      {sessionId && <RecentLicenses licenses={recentLicenses} />}
    </Container>
  );
}

function Container({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:py-10">{children}</div>
  );
}

function PageHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {eyebrow}
      </p>
      <h1 className="mt-2 flex items-center gap-2 font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl">
        <FilmSlate weight="duotone" className="size-7 text-sage" />
        {title}
      </h1>
    </div>
  );
}

function StudioSignedOut() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-secondary text-sage">
        <Wallet weight="duotone" className="size-6" />
      </span>
      <div>
        <h3 className="font-display text-2xl tracking-tight">Open your studio</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
          Connect your wallet to upload clips, set USDC prices, and track earnings.
          Use the Connect wallet button in the sidebar.
        </p>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  micro,
  href,
}: {
  label: string;
  value?: string;
  sub?: string;
  micro?: number;
  href?: string;
}) {
  const body = (
    <div className="flex h-full flex-col bg-card px-4 py-4">
      <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="tabular mt-1.5 flex items-center gap-1 text-2xl font-semibold leading-none text-foreground">
        {micro != null ? (
          <>
            {formatMicroUsdc(micro)}
            <UsdcIcon size="0.7em" />
          </>
        ) : (
          value
        )}
      </dd>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
      {href && (
        <p className="mt-auto pt-2 text-xs text-muted-foreground">Withdraw →</p>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="transition-colors hover:bg-secondary/30">
      {body}
    </Link>
  ) : (
    body
  );
}

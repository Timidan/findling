import { getStudioData, type StudioMoment } from "@/server/catalog/studio";
import { getCurrentUserId } from "@/server/auth/current-user";
import { UsdcIcon } from "@/components/brand/usdc";
import { formatMicroUsdc } from "@/lib/format";
import {
  ChartLineUp,
  Eye,
  MagnifyingGlass,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  // demand + earnings are private — require the logged-in owner (no preview)
  const id = await getCurrentUserId();
  if (!id) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-5 py-24 text-center">
        <Wallet weight="duotone" className="size-9 text-sage" />
        <h1 className="font-display text-3xl tracking-tight">Connect your wallet</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with your wallet to see how agents are licensing your catalogue.
        </p>
      </div>
    );
  }
  const data = await getStudioData(id);
  const moments = data?.moments ?? [];

  const totalLicenses = moments.reduce((n, m) => n + m.licenses, 0);
  const grossMicro = moments.reduce((n, m) => n + m.earnedMicroUsdc, 0);
  const published = moments.filter((m) => m.status === "published").length;
  const avgPriceMicro = moments.length
    ? Math.round(
        moments.reduce((n, m) => n + m.priceMicroUsdc, 0) / moments.length,
      )
    : 0;

  const top = [...moments]
    .filter((m) => m.licenses > 0)
    .sort((a, b) => b.licenses - a.licenses)
    .slice(0, 6);
  const maxLicenses = top[0]?.licenses ?? 1;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:py-10">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Analytics
        </p>
        <h1 className="mt-2 font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl">
          Demand &amp; performance
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          How agents are licensing your catalogue.
        </p>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
        <Metric label="Licenses sold" value={String(totalLicenses)} />
        <Metric label="Gross earned" micro={grossMicro} />
        <Metric label="Avg. clip price" micro={avgPriceMicro} />
        <Metric label="Live moments" value={String(published)} />
      </dl>

      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          <ChartLineUp weight="bold" className="size-3.5 text-sage" />
          Top moments by demand
        </h2>
        {top.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-6 text-sm text-muted-foreground">
            No licenses settled yet. Once an agent pays to license a moment, your
            best-performing clips rank here.
          </p>
        ) : (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
            {top.map((m) => (
              <DemandBar key={m.momentId} m={m} max={maxLicenses} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <Upcoming
          icon={<MagnifyingGlass weight="duotone" className="size-5" />}
          title="Search appearances"
          body="How often agents surfaced each moment in semantic search. Impression logging is coming next."
        />
        <Upcoming
          icon={<Eye weight="duotone" className="size-5" />}
          title="Conversion over time"
          body="Surfaced → previewed → licensed funnel, day by day. Coming next."
        />
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  micro,
}: {
  label: string;
  value?: string;
  micro?: number;
}) {
  return (
    <div className="bg-card px-4 py-4">
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
    </div>
  );
}

function DemandBar({ m, max }: { m: StudioMoment; max: number }) {
  const pct = Math.max(6, Math.round((m.licenses / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm">{m.title}</p>
          <span className="tabular shrink-0 text-xs text-muted-foreground">
            {m.licenses} {m.licenses === 1 ? "license" : "licenses"}
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-sage"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="tabular inline-flex w-16 shrink-0 items-center justify-end gap-1 text-sm font-semibold text-foreground">
        {formatMicroUsdc(m.earnedMicroUsdc)}
        <UsdcIcon size="0.7em" />
      </span>
    </div>
  );
}

function Upcoming({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/30 p-5 opacity-70 transition-opacity hover:opacity-100">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
          Soon
        </span>
      </div>
      <h3 className="mt-3 font-display text-xl leading-tight tracking-tight text-muted-foreground">
        {title}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

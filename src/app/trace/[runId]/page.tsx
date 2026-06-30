import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MagicWand,
  ListMagnifyingGlass,
  Path,
  Lightning,
  SealCheck,
  ArrowRight,
  Circle,
} from "@phosphor-icons/react/dist/ssr";
import { getAgentRunTrace, getLatestSettledRunId } from "@/server/agent/trace";
import { traceMetadata } from "@/server/agent/trace-metadata";
import { getCurrentUserId, getSessionUser } from "@/server/auth/current-user";
import { SiteHeader } from "@/components/site/site-header";
import { UsdcIcon } from "@/components/brand/usdc";
import { formatMicroUsdc } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ runId: string }>;
}): Promise<Metadata> {
  let { runId } = await params;
  const viewerId = await getCurrentUserId();
  if (runId === "latest") {
    const latest = await getLatestSettledRunId(viewerId);
    if (!latest) return traceMetadata(null);
    runId = latest;
  }
  return traceMetadata(await getAgentRunTrace(runId, viewerId));
}

const usd = (micro: number) => formatMicroUsdc(micro);

export default async function TracePage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  let { runId } = await params;
  const initialUser = await getSessionUser();
  const viewerId = initialUser?.id ?? null;
  if (runId === "latest") {
    const latest = await getLatestSettledRunId(viewerId);
    if (!latest) notFound();
    runId = latest;
  }
  const t = await getAgentRunTrace(runId, viewerId);
  if (!t) notFound();

  const settled = t.paymentStatus === "settled";
  const maxScore = Math.max(0.0001, ...t.candidates.map((c) => c.score));

  return (
    <div className="dark min-h-[100dvh] bg-background text-foreground">
      <SiteHeader active="/trace/latest" tag={`agent trace · ${t.surface}`} initialUser={initialUser} />
      <main className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="mt-2 font-display text-3xl tracking-tight">How the agent decided</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          A full, auditable trace of one autonomous license — request to receipt.
        </p>

        <ol className="relative mt-10 space-y-px">
          {/* connector line */}
          <span className="absolute bottom-6 left-[19px] top-6 w-px bg-border" aria-hidden />

          <Step icon={<MagicWand weight="duotone" className="size-4" />} label="Request">
            <p className="text-sm">&ldquo;{t.requestText}&rdquo;</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {t.budgetMicroUsdc != null && (
                <Chip>
                  budget ≤ {usd(t.budgetMicroUsdc)} <UsdcIcon size="0.85em" />
                </Chip>
              )}
              <Chip>surface: {t.surface}</Chip>
            </div>
          </Step>

          <Step icon={<ListMagnifyingGlass weight="duotone" className="size-4" />} label={`Searched · ${t.candidates.length} eligible candidates`}>
            <div className="space-y-1.5">
              {t.candidates.map((c) => (
                <div key={c.momentId} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`flex min-w-0 items-center gap-1.5 text-sm ${c.chosen ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        <span className="truncate">{c.title}</span>
                        {c.chosen && (
                          <span className="shrink-0 rounded-full bg-sage/15 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-sage">
                            chosen
                          </span>
                        )}
                      </span>
                      <span
                        className={`tabular shrink-0 text-xs ${c.chosen ? "font-semibold text-sage" : "text-muted-foreground"}`}
                      >
                        {c.score.toFixed(3)}
                      </span>
                    </div>
                    <div className={`mt-1 overflow-hidden rounded-full bg-secondary ${c.chosen ? "h-1.5" : "h-1"}`}>
                      <div
                        className={`h-full rounded-full ${c.chosen ? "bg-sage" : "bg-muted-foreground/25"}`}
                        style={{ width: `${Math.max(4, (c.score / maxScore) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Step>

          <Step icon={<Path weight="duotone" className="size-4" />} label="Chose & attributed">
            <p className="text-sm">
              <span className="font-medium">{t.chosenMomentTitle ?? "—"}</span>
            </p>
            {t.chosenFinderHandle && (
              <p className="mt-1 text-xs text-muted-foreground">
                12% finder credit → <span className="text-foreground">{t.chosenFinderHandle}</span>
                {t.attributionReason ? ` (${t.attributionReason.replace(/_/g, " ")})` : ""}
              </p>
            )}
          </Step>

          <Step
            icon={<Lightning weight={settled ? "fill" : "duotone"} className="size-4" />}
            label="Paid on Arc"
            accent={settled}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm font-medium ${settled ? "text-gold" : ""}`}>
                {settled ? "settled" : t.paymentStatus.replace(/_/g, " ")}
              </span>
              {t.paymentReference && (
                <span className="tabular text-xs text-muted-foreground">· ref {t.paymentReference.slice(0, 12)}…</span>
              )}
            </div>
          </Step>

          {t.receiptSlug && (
            <Step icon={<SealCheck weight="fill" className="size-4" />} label="Receipt" accent>
              <Link
                href={`/r/${t.receiptSlug}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gold transition-colors hover:opacity-80"
              >
                view public receipt <ArrowRight className="size-4" />
              </Link>
            </Step>
          )}
        </ol>
      </main>
    </div>
  );
}

function Step({
  icon,
  label,
  children,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <li className="relative flex gap-4 pb-7">
      <span
        className={`relative z-10 grid size-10 shrink-0 place-items-center rounded-full border ${
          accent ? "border-gold/40 bg-gold-soft text-gold" : "border-border bg-card text-sage"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="tabular inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[0.7rem] text-muted-foreground">
      <Circle weight="fill" className="size-1.5 text-sage" />
      {children}
    </span>
  );
}

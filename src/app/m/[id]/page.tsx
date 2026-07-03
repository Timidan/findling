import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SealCheck, Clock, Tag } from "@phosphor-icons/react/dist/ssr";
import { getMomentDetail } from "@/server/find/moment-detail";
import { isUuid } from "@/server/http/uuid";
import { getSessionUser } from "@/server/auth/current-user";
import { SiteHeader } from "@/components/site/site-header";
import { LicenseCheckout } from "@/components/find/license-checkout";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const m = isUuid(id) ? await getMomentDetail(id) : null;
  return {
    title: m ? `${m.title} · Findling` : "Moment · Findling",
    description: m?.description ?? "Use this video clip with a clear receipt.",
  };
}

function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
      {icon}
      {label}
    </span>
  );
}

export default async function MomentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [initialUser, moment] = await Promise.all([
    getSessionUser(),
    getMomentDetail(id),
  ]);
  if (!moment) notFound();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <SiteHeader tag="Use clip" initialUser={initialUser} />
      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-8 px-5 py-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black">
            <video
              src={moment.previewUrl}
              poster={moment.posterUrl ?? undefined}
              controls
              loop
              playsInline
              className="size-full object-contain"
            />
            <span className="tabular absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[0.6rem] uppercase tracking-wider text-white/80">
              Watermarked preview
            </span>
          </div>

          <h1 className="mt-5 font-display text-3xl leading-tight tracking-tight text-balance">
            {moment.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {moment.creatorName} · {moment.sourceType}
          </p>
          {moment.description && (
            <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
              {moment.description}
            </p>
          )}
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
            Preview the watermarked clip before paying. When you use it, you pay
            for permission to use the full-quality clip and receive a receipt.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Badge
              icon={<SealCheck weight="fill" className="size-3.5 text-sage" />}
              label={moment.licence}
            />
            <Badge
              icon={<Clock weight="bold" className="size-3.5" />}
              label={`${(moment.durationMs / 1000).toFixed(1)}s`}
            />
            <Badge
              icon={<Tag weight="bold" className="size-3.5" />}
              label={moment.usageType.replace(/_/g, " ")}
            />
          </div>
        </div>

        <aside className="lg:pt-1">
          <LicenseCheckout
            key={initialUser?.id ?? initialUser?.address ?? "signed-out"}
            moment={{
              id: moment.id,
              title: moment.title,
              priceMicroUsdc: moment.priceMicroUsdc,
              priceUsd: moment.priceUsd,
              usageType: moment.usageType,
              licence: moment.licence,
            }}
            initialUser={initialUser}
          />
        </aside>
      </main>
    </div>
  );
}

import Link from "next/link";
import {
  Plus,
  YoutubeLogo,
  UploadSimple,
  FilmSlate,
  Sparkle,
  SealCheck,
} from "@phosphor-icons/react/dist/ssr";
import type { StudioMoment } from "@/server/catalog/studio";
import { UsdcIcon } from "@/components/brand/usdc";
import { PriceControl } from "@/components/studio/price-control";
import { PublishControl } from "@/components/studio/publish-control";
import { formatMicroUsdc } from "@/lib/format";

const STATUS_STYLES: Record<string, string> = {
  published: "bg-sage/15 text-sage",
  draft: "bg-secondary text-muted-foreground",
  disabled: "bg-destructive/10 text-destructive",
  takedown_pending: "bg-destructive/10 text-destructive",
};

/**
 * A single moment in the management list — poster, meta, price, licenses.
 * `showEarned` reveals the private sales/earnings (licenses + earned USDC); it
 * must be false in the logged-out public catalogue preview so a creator's
 * earnings never leak to visitors.
 */
export function MomentCard({
  m,
  showEarned = false,
}: {
  m: StudioMoment;
  showEarned?: boolean;
}) {
  return (
    <article className="flex gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="relative aspect-[9/12] w-24 shrink-0 overflow-hidden rounded-xl bg-secondary ring-1 ring-inset ring-border">
        {m.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.posterUrl}
            alt={`${m.title} poster frame`}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center text-sage">
            <FilmSlate weight="duotone" className="size-6" />
          </div>
        )}
        {/* scrim so the duration chip stays legible over any frame */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
        <span className="tabular absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[0.6rem] font-medium text-white">
          {(m.durationMs / 1000).toFixed(1)}s
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-display text-xl leading-tight tracking-tight">
            {m.title}
          </h3>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StatusBadge status={m.status} />
            {/* owner-only: publish a draft moment so agents can discover it */}
            {showEarned && <PublishControl momentId={m.momentId} status={m.status} />}
          </div>
        </div>

        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="capitalize">{m.usageType.replace("_", " ")}</span>
          <span className="size-1 rounded-full bg-border" />
          <span>{m.sourceType === "youtube" ? "YouTube import" : "Upload"}</span>
          {m.ownershipVerified && (
            <span className="inline-flex items-center gap-0.5 text-sage">
              <SealCheck weight="fill" className="size-3" /> verified
            </span>
          )}
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
              Price
            </p>
            {/* owner can edit the price inline; visitors see it read-only */}
            {showEarned ? (
              <PriceControl momentId={m.momentId} initialMicro={m.priceMicroUsdc} />
            ) : (
              <span className="tabular inline-flex items-center gap-1 text-sm font-semibold text-foreground">
                {formatMicroUsdc(m.priceMicroUsdc)}
                <UsdcIcon size="0.8em" />
              </span>
            )}
          </div>
          {showEarned && (
            <div className="text-right">
              <p className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
                {m.licenses} {m.licenses === 1 ? "use" : "uses"}
              </p>
              {m.earnedMicroUsdc > 0 ? (
                <span className="tabular inline-flex items-center gap-1 text-sm font-semibold text-foreground">
                  {formatMicroUsdc(m.earnedMicroUsdc)}
                  <UsdcIcon size="0.8em" />
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">No paid uses yet</span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-wider ${
        STATUS_STYLES[status] ?? "bg-secondary text-muted-foreground"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

/** The two creation entry points — YouTube import + manual upload. */
export function ImportCta({ size = "lg" }: { size?: "lg" | "sm" }) {
  const pad = size === "sm" ? "px-3.5 py-2 text-sm" : "px-4 py-2.5 text-sm sm:py-2";
  return (
    <>
      <Link
        href="/studio/youtube"
        className={`inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card font-medium transition-colors hover:bg-secondary/60 ${pad}`}
      >
        <YoutubeLogo weight="fill" className="size-4 text-sage" />
        Import from YouTube
      </Link>
      <Link
        href="/studio/upload"
        className={`inline-flex items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground transition-transform active:scale-[0.98] ${pad}`}
      >
        <Plus weight="bold" className="size-4" />
        New clip
      </Link>
    </>
  );
}

export function StudioEmpty() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-secondary text-sage">
        <Sparkle weight="duotone" className="size-6" />
      </span>
      <div>
        <h3 className="font-display text-2xl tracking-tight">No clips yet</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
          Upload a clip you own to start earning. You can also import from your
          YouTube channel, set a USDC price, and publish when ready.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/studio/youtube"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary/60"
        >
          <YoutubeLogo weight="fill" className="size-4 text-sage" />
          Import from YouTube
        </Link>
        <Link
          href="/studio/upload"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          <UploadSimple weight="bold" className="size-4" />
          Upload clip
        </Link>
      </div>
    </div>
  );
}

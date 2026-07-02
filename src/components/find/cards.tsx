"use client";

import Link from "next/link";
import { SealCheck, ShareNetwork, Play } from "@phosphor-icons/react/dist/ssr";
import { UsdcAmount } from "@/components/brand/usdc";

/*
 * The hub's typed feed cards — "Editorial" direction (signed-off mockup). Consumes the
 * frozen `FeedItem` contract (see docs/goals/discovery-hub/PLAN.md). NEVER renders a full
 * clip — only the watermarked `previewUrl`/`posterUrl`.
 */

// The feed contract is owned by the server read-model; import the types (erased at
// build time, so no server code reaches the client bundle) and re-export for the FE.
import type {
  FeedItem,
  AvailableFeedItem,
  WantedFeedItem,
} from "@/server/find/feed";

export type { FeedItem, AvailableFeedItem, WantedFeedItem };

function TypeChip({ kind }: { kind: "available" | "wanted" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider ${
        kind === "available" ? "bg-sage/15 text-sage" : "bg-secondary text-muted-foreground"
      }`}
    >
      {kind === "available" ? "Available" : "Wanted"}
    </span>
  );
}

function LicenceBadge({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[0.65rem] text-muted-foreground">
      <SealCheck weight="fill" className="size-3 text-sage" />
      {label}
    </span>
  );
}

export function FeedCard({ item }: { item: FeedItem }) {
  return item.kind === "available" ? (
    <AvailableCard item={item} />
  ) : (
    <WantedCard item={item} />
  );
}

function AvailableCard({ item }: { item: AvailableFeedItem }) {
  return (
    <Link
      href={`/m/${item.id}`}
      className="group flex h-full gap-3.5 rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-secondary/30"
    >
      <div className="relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-slate-800 to-slate-900">
        {item.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.posterUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : null}
        <Play
          weight="fill"
          className="absolute inset-0 m-auto size-6 text-white/75 transition-transform group-hover:scale-110"
        />
        <span className="tabular absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[0.55rem] font-medium text-white">
          {(item.durationMs / 1000).toFixed(1)}s
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <TypeChip kind="available" />
          <LicenceBadge label={item.licence} />
        </div>
        <h3 className="mt-1.5 line-clamp-2 font-display text-[0.95rem] leading-tight tracking-tight">
          {item.title}
        </h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">{item.who}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
          <UsdcAmount micro={item.priceMicroUsdc} className="tabular gap-0.5 text-sm font-semibold" />
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            Use clip
          </span>
        </div>
      </div>
    </Link>
  );
}

function WantedCard({ item }: { item: WantedFeedItem }) {
  return (
    <Link
      href={`/find/claim-start/${item.listingId}`}
      className="group flex h-full gap-3.5 rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-secondary/30"
    >
      <div className="relative grid aspect-[4/5] w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary/50">
        <ShareNetwork weight="bold" className="size-6 text-sage/60" />
        {item.sourceThumbnailUrl && (
          // The source video's thumbnail sits on top of the icon; if it fails to load
          // (dead instance / removed video) we hide it and the icon shows through.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.sourceThumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="absolute inset-0 size-full object-cover"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <TypeChip kind="wanted" />
          <LicenceBadge label={item.sourceLicenceLabel} />
        </div>
        <h3 className="mt-1.5 line-clamp-2 font-display text-[0.95rem] leading-tight tracking-tight">
          {item.title}
        </h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">{item.externalIdentity}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
          <span className="min-w-0">
            <UsdcAmount micro={item.pledgedDemandMicroUsdc} className="tabular gap-0.5 text-sm font-semibold" />
            <span className="tabular ml-1.5 text-[0.65rem] text-muted-foreground">
              · {item.pledgeCount} {item.pledgeCount === 1 ? "request" : "requests"}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold">
            Claim request
          </span>
        </div>
      </div>
    </Link>
  );
}

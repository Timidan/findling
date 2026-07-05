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
      {kind === "available" ? "Available" : "Request"}
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

function PeerTubeBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      aria-label="PeerTube source"
      className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[0.55rem] font-medium text-white shadow-sm backdrop-blur"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-3"
        focusable="false"
      >
        <path d="M9 4v8l7-4-7-4Z" fill="#f1680d" />
        <path d="M9 12v8l7-4-7-4Z" fill="#000" />
        <path d="M2 8v8l7-4-7-4Z" fill="#fff" />
      </svg>
      PeerTube
    </span>
  );
}

function PaidCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} paid uses`}
      className="absolute right-1.5 top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[0.55rem] font-semibold tabular text-primary-foreground shadow-sm"
    >
      {count} paid
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
        <PeerTubeBadge show={item.sourceType === "peertube"} />
        {item.licenses > 0 && <PaidCountBadge count={item.licenses} />}
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
          <span className="flex min-w-0 items-center gap-2">
            <UsdcAmount micro={item.priceMicroUsdc} className="tabular gap-0.5 text-sm font-semibold" />
            {item.licenses > 0 && (
              <span className="tabular text-[0.65rem] text-muted-foreground">
                {item.licenses} paid
              </span>
            )}
          </span>
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
        <PeerTubeBadge show={item.sourceType === "peertube"} />
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

import {
  ShareNetwork,
  Coins,
  SealCheck,
} from "@phosphor-icons/react/dist/ssr";
import { UsdcAmount } from "@/components/brand/usdc";
import type {
  PublicWantedListing,
  ListingStatus,
} from "@/components/wanted/sample-listings";

const STATUS_STYLES: Record<ListingStatus, string> = {
  open: "bg-sage/15 text-sage",
  claimed: "bg-secondary text-foreground",
  activated: "bg-sage/15 text-sage",
  expired: "bg-secondary text-muted-foreground",
};

const STATUS_LABEL: Record<ListingStatus, string> = {
  open: "claimable",
  claimed: "claimed",
  activated: "live",
  expired: "expired",
};

/**
 * The public Wanted board — funded demand for moments from creators who aren't on
 * Findling yet, seeded from the open fediverse. Each card advertises demand only;
 * nothing here is payable until the creator claims and uploads their own clip.
 */
export function WantedFeed({ listings }: { listings: PublicWantedListing[] }) {
  if (listings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
        <p className="font-display text-2xl tracking-tight">No demand yet</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
          Buyer agents have not requested any clips yet. Check back soon.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {listings.map((l) => (
        <li key={l.id}>
          <ListingCard listing={l} />
        </li>
      ))}
    </ul>
  );
}

function ListingCard({ listing: l }: { listing: PublicWantedListing }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <ShareNetwork weight="bold" className="size-3.5 shrink-0 text-sage" />
          <span className="truncate">{l.externalIdentity}</span>
        </span>
        <StatusPill status={l.status} />
      </div>

      <h3 className="mt-2 line-clamp-2 font-display text-lg leading-tight tracking-tight">
        {l.title}
      </h3>

      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
            Requested value
          </p>
          <UsdcAmount
            micro={l.pledgedDemandMicroUsdc}
            className="tabular gap-0.5 text-base font-semibold text-foreground"
          />
          <p className="tabular mt-0.5 inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground">
            <Coins weight="fill" className="size-3" />
            {l.pledgeCount} {l.pledgeCount === 1 ? "request" : "requests"}
          </p>
        </div>
        {l.sourceLicenceLabel && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
            <SealCheck weight="fill" className="size-3 text-sage" />
            {l.sourceLicenceLabel}
          </span>
        )}
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: ListingStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-wider ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

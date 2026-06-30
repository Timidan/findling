/**
 * Public "Wanted board" data seam (T3, FE).
 *
 * The public Wanted feed renders from this typed shape. Today it returns
 * placeholder seed rows so the page is reviewable in parallel with the backend.
 *
 * SWAP WHEN T2/T4 LAND: replace the body of `getPublicWantedListings()` with
 *   `import { listListings } from "@/server/claimable/listings";`
 *   `return listListings({ audience: "public", limit });`
 * The `PublicWantedListing` fields below ARE the frozen public contract
 * (spec §10 GET feed + the creator label + CC badge the feed needs), so the swap
 * is a one-liner with no shape change. A claimable listing is NOT a moment and is
 * never payable here — it only advertises demand.
 */
import { listListings } from "@/server/claimable/listings";

export type ExternalIdentityKind =
  | "peertube_channel"
  | "activitypub_actor"
  | "youtube_channel"
  | "handle"
  | "url";

export type ListingStatus = "open" | "claimed" | "activated" | "expired";

export interface PublicWantedListing {
  id: string;
  title: string;
  /** human label, e.g. "karate_kombat · peertube.uno" */
  externalIdentity: string;
  externalIdentityKind: ExternalIdentityKind;
  /** commercially-clean CC label for the badge, e.g. "CC BY-SA" (null when unknown) */
  sourceLicenceLabel: string | null;
  /** live "pledged interest" — funded demand, NOT held money. integer micro-USDC. */
  pledgedDemandMicroUsdc: number;
  pledgeCount: number;
  status: ListingStatus;
}

const SEED: PublicWantedListing[] = [
  {
    id: "seed-1",
    title: "Last-second buzzer-beater three, full arena erupting",
    externalIdentity: "hoops_daily · peertube.uno",
    externalIdentityKind: "peertube_channel",
    sourceLicenceLabel: "CC BY-SA",
    pledgedDemandMicroUsdc: 420_000,
    pledgeCount: 6,
    status: "open",
  },
  {
    id: "seed-2",
    title: "Clean ace, round 30, CT-side clutch reaction",
    externalIdentity: "karate_kombat · peertube.uno",
    externalIdentityKind: "peertube_channel",
    sourceLicenceLabel: "CC BY",
    pledgedDemandMicroUsdc: 310_000,
    pledgeCount: 4,
    status: "open",
  },
  {
    id: "seed-3",
    title: "Drone shot gliding over a flooded subway entrance",
    externalIdentity: "urban_drone · framatube.org",
    externalIdentityKind: "peertube_channel",
    sourceLicenceLabel: "CC0",
    pledgedDemandMicroUsdc: 180_000,
    pledgeCount: 3,
    status: "open",
  },
  {
    id: "seed-4",
    title: "Founder mid-sentence: \"we never raised a round\"",
    externalIdentity: "indie_pods · tilvids.com",
    externalIdentityKind: "peertube_channel",
    sourceLicenceLabel: "CC BY",
    pledgedDemandMicroUsdc: 95_000,
    pledgeCount: 2,
    status: "claimed",
  },
  {
    id: "seed-5",
    title: "Slow-mo espresso pour, crema blooming in the cup",
    externalIdentity: "cafe_craft · peertube.uno",
    externalIdentityKind: "peertube_channel",
    sourceLicenceLabel: "CC BY-SA",
    pledgedDemandMicroUsdc: 64_000,
    pledgeCount: 2,
    status: "open",
  },
  {
    id: "seed-6",
    title: "Northern lights time-lapse over a frozen lake",
    externalIdentity: "nightsky_no · diode.zone",
    externalIdentityKind: "peertube_channel",
    sourceLicenceLabel: "CC0",
    pledgedDemandMicroUsdc: 240_000,
    pledgeCount: 5,
    status: "open",
  },
];

/**
 * Returns the public Wanted board — real claimable listings from
 * `listListings({ audience: "public" })` (seeded from PeerTube). Falls back to the
 * placeholder SEED only if the DB is unreachable, so the page always renders.
 */
export async function getPublicWantedListings(
  limit = 60,
): Promise<PublicWantedListing[]> {
  try {
    const { listings } = await listListings({ audience: "public", limit });
    if (listings.length > 0) {
      return listings.map((l) => ({
        id: l.id,
        title: l.title,
        externalIdentity: l.externalIdentity,
        externalIdentityKind: l.externalIdentityKind,
        sourceLicenceLabel: l.sourceLicenceLabel,
        pledgedDemandMicroUsdc: l.pledgedDemandMicroUsdc,
        pledgeCount: l.pledgeCount,
        status: l.status,
      }));
    }
  } catch {
    // DB unreachable — fall through to the sample seed so the page still renders.
  }
  return SEED.slice(0, limit);
}

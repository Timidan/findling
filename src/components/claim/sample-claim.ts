/**
 * Claim-page data seam (T3, FE). The claim page renders from this shape.
 *
 * SWAP WHEN the claim read endpoint lands: replace the body of `getClaimView()`
 * with a fetch of `GET /api/claim/:token` (public) → `{ listing, pledgedDemandMicroUsdc }`.
 * The fields below are the frozen public claim contract (spec §10), so the swap is
 * a one-liner. Today it returns a placeholder so the claim shell is reviewable in
 * parallel with the backend.
 */
import type {
  ExternalIdentityKind,
  ListingStatus,
} from "@/components/wanted/sample-listings";
import {
  getClaimSession,
  ClaimValidationError,
  type PublicActorControlProof,
} from "@/server/claimable/claim";

export interface ClaimView {
  found: boolean;
  listingId: string;
  title: string;
  externalIdentity: string;
  externalIdentityKind: ExternalIdentityKind;
  externalRef: string | null;
  sourceLicenceLabel: string | null;
  pledgedDemandMicroUsdc: number;
  pledgeCount: number;
  status: ListingStatus;
  actorControlProof: PublicActorControlProof | null;
}

/**
 * Resolve a claim link to its public session (listing + live pledged demand) via
 * the real `getClaimSession`, which verifies the unguessable secret server-side.
 * An unknown/invalid token renders the not-found path.
 */
export async function getClaimView(token: string): Promise<ClaimView> {
  try {
    const s = await getClaimSession(token);
    return {
      found: true,
      listingId: s.listing.id,
      title: s.listing.title,
      externalIdentity: s.listing.externalIdentity,
      externalIdentityKind: s.listing.externalIdentityKind,
      externalRef: s.listing.externalRef,
      sourceLicenceLabel: s.listing.sourceLicenceLabel,
      pledgedDemandMicroUsdc: s.pledgedDemandMicroUsdc,
      pledgeCount: s.pledgeCount,
      status: s.listing.status,
      actorControlProof: s.actorControlProof,
    };
  } catch (e) {
    if (e instanceof ClaimValidationError) return NOT_FOUND;
    throw e;
  }
}

const NOT_FOUND: ClaimView = {
  found: false,
  listingId: "",
  title: "",
  externalIdentity: "",
  externalIdentityKind: "url",
  externalRef: null,
  sourceLicenceLabel: null,
  pledgedDemandMicroUsdc: 0,
  pledgeCount: 0,
  status: "open",
  actorControlProof: null,
};

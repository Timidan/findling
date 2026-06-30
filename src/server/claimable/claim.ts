import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { claimableListings } from "../db/schema";
import { PEERTUBE_ATTESTATION_VERSION } from "../ownership/attestation";
import { claimVerificationTokenForListing } from "./peertube-proof";
import { getPledgedDemand } from "./pledges";

type ClaimableListingRow = typeof claimableListings.$inferSelect;

export interface ClaimAttestationSnapshot {
  ownershipModel: "channel_control";
  attestationVersion: string;
}

export interface ClaimListingResult {
  listing: ClaimableListingRow;
  attestation: ClaimAttestationSnapshot | null;
}

export interface PublicActorControlProof {
  required: true;
  kind: "peertube_actor_token";
  token: string;
  externalRef: string | null;
  acceptedFields: readonly ["actor.summary", "video.support"];
  instructions: string;
}

export interface PublicClaimSession {
  listing: {
    id: string;
    title: string;
    externalIdentity: string;
    externalIdentityKind: ClaimableListingRow["externalIdentityKind"];
    externalRef: string | null;
    sourceLicenceLabel: string | null;
    status: ClaimableListingRow["status"];
  };
  pledgedDemandMicroUsdc: number;
  pledgeCount: number;
  actorControlProof: PublicActorControlProof | null;
}

export type ClaimProofSnapshot = Record<string, unknown>;

export interface ClaimProofVerification {
  verified: boolean;
  snapshot?: ClaimProofSnapshot;
}

export type ClaimProofVerifier = (
  listing: ClaimableListingRow,
  proof: unknown,
) => Promise<boolean | ClaimProofVerification>;

export interface ClaimListingInput {
  secret: string;
  userId: string;
  proof?: unknown;
  proofVerifier?: ClaimProofVerifier;
}

export class ClaimValidationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ClaimValidationError";
  }
}

const ACTOR_CONTROL_KINDS = new Set<ClaimableListingRow["externalIdentityKind"]>([
  "peertube_channel",
  "activitypub_actor",
]);

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function assertClaimInputs(secret: string, userId: string): void {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new ClaimValidationError("invalid_claim_input");
  }
  if (typeof userId !== "string" || userId.length === 0) {
    throw new ClaimValidationError("invalid_claim_input");
  }
}

function attestationForListing(
  listing: ClaimableListingRow,
): ClaimAttestationSnapshot | null {
  if (!ACTOR_CONTROL_KINDS.has(listing.externalIdentityKind)) return null;
  return {
    ownershipModel: "channel_control",
    attestationVersion: PEERTUBE_ATTESTATION_VERSION,
  };
}

async function defaultProofVerifier(): Promise<ClaimProofVerification> {
  return { verified: false };
}

function actorControlProofForListing(
  listing: ClaimableListingRow,
): PublicActorControlProof | null {
  if (!ACTOR_CONTROL_KINDS.has(listing.externalIdentityKind)) return null;
  return {
    required: true,
    kind: "peertube_actor_token",
    token: claimVerificationTokenForListing(listing.id),
    externalRef: listing.externalRef,
    acceptedFields: ["actor.summary", "video.support"],
    instructions:
      "Paste this token into your public PeerTube channel description or a public video support field, then submit it back to Findling.",
  };
}

function normalizeProofVerification(
  value: boolean | ClaimProofVerification,
): ClaimProofVerification {
  return typeof value === "boolean" ? { verified: value } : value;
}

export async function resolveClaimListingBySecret(
  secret: string,
): Promise<ClaimableListingRow> {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new ClaimValidationError("invalid_claim_secret");
  }

  const [listing] = await db
    .select()
    .from(claimableListings)
    .where(eq(claimableListings.claimSecretHash, hashSecret(secret)))
    .limit(1);

  if (!listing) {
    throw new ClaimValidationError("invalid_claim_secret");
  }
  return listing;
}

async function resolveListingById(
  listingId: string,
): Promise<ClaimableListingRow | null> {
  const [listing] = await db
    .select()
    .from(claimableListings)
    .where(eq(claimableListings.id, listingId))
    .limit(1);
  return listing ?? null;
}

function toPublicSession(
  listing: ClaimableListingRow,
  demand: { pledgedDemandMicroUsdc: number; pledgeCount: number },
): PublicClaimSession {
  return {
    listing: {
      id: listing.id,
      title: listing.title,
      externalIdentity: listing.externalIdentity,
      externalIdentityKind: listing.externalIdentityKind,
      externalRef: listing.externalRef,
      sourceLicenceLabel: listing.sourceLicenceLabel,
      status: listing.status,
    },
    pledgedDemandMicroUsdc: demand.pledgedDemandMicroUsdc,
    pledgeCount: demand.pledgeCount,
    actorControlProof: actorControlProofForListing(listing),
  };
}

export async function getClaimSession(
  secret: string,
): Promise<PublicClaimSession> {
  const listing = await resolveClaimListingBySecret(secret);
  const demand = await getPledgedDemand(listing.id);
  return toPublicSession(listing, demand);
}

/**
 * Public claim-start session resolved by listing id (the discovery-hub Wanted card
 * path — no secret). Offered ONLY for actor-control listings, whose claim is gated
 * by a posted control proof. url/youtube kinds have no such proof, so their
 * unguessable claim secret stays their only entry and we do not expose them by id.
 */
export async function getClaimSessionByListingId(
  listingId: string,
): Promise<PublicClaimSession | null> {
  if (typeof listingId !== "string" || listingId.length === 0) return null;
  const listing = await resolveListingById(listingId);
  if (!listing) return null;
  if (!ACTOR_CONTROL_KINDS.has(listing.externalIdentityKind)) return null;
  const demand = await getPledgedDemand(listing.id);
  return toPublicSession(listing, demand);
}

async function performClaim(
  listing: ClaimableListingRow,
  userId: string,
  proof: unknown,
  proofVerifier?: ClaimProofVerifier,
): Promise<ClaimListingResult> {
  if (listing.finderId === userId) {
    throw new ClaimValidationError("finder_cannot_claim_own_listing");
  }

  if (listing.status === "claimed" && listing.claimedByUserId === userId) {
    return { listing, attestation: attestationForListing(listing) };
  }

  if (listing.status !== "open") {
    throw new ClaimValidationError("listing_not_claimable");
  }

  let claimProofSnapshot: ClaimProofSnapshot | null = null;
  if (ACTOR_CONTROL_KINDS.has(listing.externalIdentityKind)) {
    const verifier = proofVerifier ?? defaultProofVerifier;
    const verification = normalizeProofVerification(await verifier(listing, proof));
    if (!verification.verified) {
      throw new ClaimValidationError("actor_proof_required");
    }
    claimProofSnapshot = verification.snapshot ?? null;
  }

  const claimedAt = new Date();
  const updateValues: Partial<typeof claimableListings.$inferInsert> = {
    claimedByUserId: userId,
    claimedAt,
    status: "claimed",
    updatedAt: claimedAt,
  };
  if (claimProofSnapshot) {
    updateValues.claimProofSnapshot = claimProofSnapshot;
  }

  const [updated] = await db
    .update(claimableListings)
    .set(updateValues)
    .where(
      and(
        eq(claimableListings.id, listing.id),
        eq(claimableListings.status, "open"),
      ),
    )
    .returning();

  if (updated) {
    return { listing: updated, attestation: attestationForListing(updated) };
  }

  const fresh = await resolveListingById(listing.id);
  if (fresh?.status === "claimed" && fresh.claimedByUserId === userId) {
    return { listing: fresh, attestation: attestationForListing(fresh) };
  }
  throw new ClaimValidationError("listing_not_claimable");
}

export async function claimListing(
  input: ClaimListingInput,
): Promise<ClaimListingResult> {
  assertClaimInputs(input.secret, input.userId);
  const listing = await resolveClaimListingBySecret(input.secret);
  return performClaim(listing, input.userId, input.proof, input.proofVerifier);
}

export interface ClaimListingByListingInput {
  listingId: string;
  userId: string;
  proof?: unknown;
  proofVerifier?: ClaimProofVerifier;
}

/**
 * Claim a listing resolved by its public id (the Wanted-card claim-start path).
 * Restricted to actor-control listings: the posted control proof is the gate, so
 * no secret is needed. Other kinds must keep using their unguessable claim link.
 */
export async function claimListingByListing(
  input: ClaimListingByListingInput,
): Promise<ClaimListingResult> {
  if (
    typeof input.listingId !== "string" ||
    input.listingId.length === 0 ||
    typeof input.userId !== "string" ||
    input.userId.length === 0
  ) {
    throw new ClaimValidationError("invalid_claim_input");
  }
  const listing = await resolveListingById(input.listingId);
  if (!listing) {
    throw new ClaimValidationError("listing_not_found");
  }
  if (!ACTOR_CONTROL_KINDS.has(listing.externalIdentityKind)) {
    throw new ClaimValidationError("claim_requires_secret");
  }
  return performClaim(listing, input.userId, input.proof, input.proofVerifier);
}

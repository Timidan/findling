import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeDb = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn() }));
const pledges = vi.hoisted(() => ({ getPledgedDemand: vi.fn() }));

vi.mock("../db/client", () => ({ db: fakeDb }));
vi.mock("./pledges", () => ({ getPledgedDemand: pledges.getPledgedDemand }));

import {
  getClaimSessionByListingId,
  claimListingByListing,
} from "./claim";

const LISTING_ID = "33333333-3333-4333-8333-333333333333";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const FINDER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_AUTH_SECRET =
  "test-auth-session-secret-with-at-least-thirty-two-characters";

function listing(over: Record<string, unknown> = {}) {
  return {
    id: LISTING_ID,
    finderId: FINDER_ID,
    externalIdentity: "@creator@example.video",
    externalIdentityKind: "peertube_channel",
    externalRef: "https://example.video/video-channels/creator",
    externalRefNormalized: "https://example.video/video-channels/creator",
    title: "Buzzer beater from the finals",
    description: null,
    relevanceText: null,
    sourceLicenceLabel: "CC BY-SA",
    claimSecretHash: "stored-hash",
    status: "open",
    claimedByUserId: null,
    claimedAt: null,
    claimProofSnapshot: null,
    createdMomentId: null,
    expiresAt: null,
    createdAt: new Date("2026-06-24T10:00:00.000Z"),
    updatedAt: new Date("2026-06-24T10:00:00.000Z"),
    ...over,
  };
}

function mockSelectById(rows: Record<string, unknown>[]) {
  fakeDb.select.mockReturnValueOnce({
    from: () => ({ where: () => ({ limit: async () => rows }) }),
  });
}
function mockUpdate(rows: Record<string, unknown>[]) {
  const returning = vi.fn(async () => rows);
  fakeDb.update.mockReturnValueOnce({
    set: () => ({ where: () => ({ returning }) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SESSION_SECRET = TEST_AUTH_SECRET;
  pledges.getPledgedDemand.mockResolvedValue({
    pledgedDemandMicroUsdc: 5_000,
    pledgeCount: 2,
  });
});

describe("getClaimSessionByListingId", () => {
  it("returns a public session (demand + control-proof token, no secret) for actor-control", async () => {
    mockSelectById([listing()]);
    const s = await getClaimSessionByListingId(LISTING_ID);
    expect(s).not.toBeNull();
    expect(s!.listing.id).toBe(LISTING_ID);
    expect(s!.pledgedDemandMicroUsdc).toBe(5_000);
    expect(s!.pledgeCount).toBe(2);
    expect(s!.actorControlProof?.required).toBe(true);
    // never leak the secret hash on the public surface
    expect(JSON.stringify(s)).not.toContain("stored-hash");
  });

  it("returns null for a non-actor-control listing (url/youtube keep secret-only entry)", async () => {
    mockSelectById([listing({ externalIdentityKind: "youtube_channel" })]);
    expect(await getClaimSessionByListingId(LISTING_ID)).toBeNull();
  });

  it("returns null when the listing does not exist", async () => {
    mockSelectById([]);
    expect(await getClaimSessionByListingId(LISTING_ID)).toBeNull();
  });

  it("returns null for empty input", async () => {
    expect(await getClaimSessionByListingId("")).toBeNull();
  });
});

describe("claimListingByListing", () => {
  it("rejects non-actor-control listings (must use the secret link)", async () => {
    mockSelectById([listing({ externalIdentityKind: "url" })]);
    await expect(
      claimListingByListing({ listingId: LISTING_ID, userId: CREATOR_ID }),
    ).rejects.toMatchObject({ reason: "claim_requires_secret" });
    expect(fakeDb.update).not.toHaveBeenCalled();
  });

  it("rejects when the listing is not found", async () => {
    mockSelectById([]);
    await expect(
      claimListingByListing({ listingId: LISTING_ID, userId: CREATOR_ID }),
    ).rejects.toMatchObject({ reason: "listing_not_found" });
  });

  it("rejects a finder self-claim", async () => {
    mockSelectById([listing({ finderId: CREATOR_ID })]);
    await expect(
      claimListingByListing({ listingId: LISTING_ID, userId: CREATOR_ID }),
    ).rejects.toMatchObject({ reason: "finder_cannot_claim_own_listing" });
  });

  it("requires a control proof for actor-control listings", async () => {
    mockSelectById([listing()]);
    await expect(
      claimListingByListing({ listingId: LISTING_ID, userId: CREATOR_ID }),
    ).rejects.toMatchObject({ reason: "actor_proof_required" });
    expect(fakeDb.update).not.toHaveBeenCalled();
  });

  it("claims when the control proof verifies", async () => {
    mockSelectById([listing()]);
    mockUpdate([listing({ status: "claimed", claimedByUserId: CREATOR_ID })]);
    const proofVerifier = vi.fn(async () => true);
    const res = await claimListingByListing({
      listingId: LISTING_ID,
      userId: CREATOR_ID,
      proof: { actorToken: "ok" },
      proofVerifier,
    });
    expect(res.listing.status).toBe("claimed");
    expect(res.listing.claimedByUserId).toBe(CREATOR_ID);
    expect(proofVerifier).toHaveBeenCalledWith(
      expect.objectContaining({ id: LISTING_ID }),
      { actorToken: "ok" },
    );
  });

  it("is idempotent for the same claimant (already claimed)", async () => {
    mockSelectById([listing({ status: "claimed", claimedByUserId: CREATOR_ID })]);
    const res = await claimListingByListing({
      listingId: LISTING_ID,
      userId: CREATOR_ID,
    });
    expect(res.listing.status).toBe("claimed");
    expect(fakeDb.update).not.toHaveBeenCalled();
  });
});

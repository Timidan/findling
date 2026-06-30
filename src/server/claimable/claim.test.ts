import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeDb = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
}));
const dns = vi.hoisted(() => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

vi.mock("../db/client", () => ({ db: fakeDb }));
vi.mock("node:dns/promises", () => dns);

import {
  claimListing,
  ClaimValidationError,
} from "./claim";
import { claimVerificationTokenForListing } from "./peertube-proof";
import {
  claimSessionResponse,
  getClaimSessionResponse,
} from "../../app/api/claim/[token]/route";

const FINDER_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_CREATOR_ID = "44444444-4444-4444-8444-444444444444";
const LISTING_ID = "33333333-3333-4333-8333-333333333333";
const CLAIM_SECRET = "claim-secret";
const TEST_AUTH_SECRET =
  "test-auth-session-secret-with-at-least-thirty-two-characters";
const originalFetch = globalThis.fetch;

type ListingRow = {
  id: string;
  finderId: string;
  externalIdentity: string;
  externalIdentityKind:
    | "youtube_channel"
    | "peertube_channel"
    | "activitypub_actor"
    | "handle"
    | "url";
  externalRef: string | null;
  externalRefNormalized: string | null;
  title: string;
  description: string | null;
  relevanceText: string | null;
  sourceLicenceLabel: string | null;
  sourceThumbnailUrl: string | null;
  claimSecretHash: string;
  status: "open" | "claimed" | "activated" | "expired";
  claimedByUserId: string | null;
  claimedAt: Date | null;
  claimProofSnapshot: Record<string, unknown> | null;
  createdMomentId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function listing(overrides: Partial<ListingRow> = {}): ListingRow {
  return {
    id: LISTING_ID,
    finderId: FINDER_ID,
    externalIdentity: "@creator@example.video",
    externalIdentityKind: "peertube_channel",
    externalRef: "https://example.video/video-channels/creator",
    externalRefNormalized: "https://example.video/video-channels/creator",
    title: "Buzzer beater from the finals",
    description: "Need the final shot from the fourth quarter.",
    relevanceText: "Basketball recap agents are requesting this moment.",
    sourceLicenceLabel: "CC BY-SA",
    sourceThumbnailUrl: null,
    claimSecretHash: "stored-hash",
    status: "open",
    claimedByUserId: null,
    claimedAt: null,
    claimProofSnapshot: null,
    createdMomentId: null,
    expiresAt: null,
    createdAt: new Date("2026-06-24T10:00:00.000Z"),
    updatedAt: new Date("2026-06-24T10:00:00.000Z"),
    ...overrides,
  };
}

function mockSelectRows(rows: Record<string, unknown>[]) {
  fakeDb.select.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => rows),
      })),
    })),
  });
}

function mockClaimUpdate(rows: Record<string, unknown>[]) {
  const sets: Record<string, unknown>[] = [];
  const returning = vi.fn(async () => rows);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn((values: Record<string, unknown>) => {
    sets.push(values);
    return { where };
  });
  fakeDb.update.mockReturnValueOnce({ set });
  return { sets, returning };
}

describe("claimListing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    process.env.AUTH_SESSION_SECRET = TEST_AUTH_SECRET;
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects a wrong claim secret", async () => {
    mockSelectRows([]);

    await expect(
      claimListing({ secret: CLAIM_SECRET, userId: CREATOR_ID }),
    ).rejects.toMatchObject({ reason: "invalid_claim_secret" });
  });

  it("rejects a finder self-claim", async () => {
    mockSelectRows([listing({ finderId: CREATOR_ID })]);

    await expect(
      claimListing({ secret: CLAIM_SECRET, userId: CREATOR_ID }),
    ).rejects.toMatchObject({ reason: "finder_cannot_claim_own_listing" });
    expect(fakeDb.update).not.toHaveBeenCalled();
  });

  it("rejects actor-control claims when no proof verifier establishes control", async () => {
    mockSelectRows([listing()]);

    await expect(
      claimListing({ secret: CLAIM_SECRET, userId: CREATOR_ID }),
    ).rejects.toMatchObject({ reason: "actor_proof_required" });
    expect(fakeDb.update).not.toHaveBeenCalled();
  });

  it("rejects an injected actor-control proof mismatch", async () => {
    const proof = { actorToken: "wrong-token" };
    const proofVerifier = vi.fn(async () => false);
    mockSelectRows([listing()]);

    await expect(
      claimListing({
        secret: CLAIM_SECRET,
        userId: CREATOR_ID,
        proof,
        proofVerifier,
      }),
    ).rejects.toMatchObject({ reason: "actor_proof_required" });
    expect(proofVerifier).toHaveBeenCalledWith(
      expect.objectContaining({ id: LISTING_ID }),
      proof,
    );
    expect(fakeDb.update).not.toHaveBeenCalled();
  });

  it("keeps the demo injected-verifier path working for actor-control claims", async () => {
    const claimed = listing({
      status: "claimed",
      claimedByUserId: CREATOR_ID,
      claimedAt: new Date("2026-06-24T10:01:00.000Z"),
    });
    const proof = { actorToken: "demo-ok" };
    const proofVerifier = vi.fn(async () => true);
    mockSelectRows([listing()]);
    const update = mockClaimUpdate([claimed]);

    const result = await claimListing({
      secret: CLAIM_SECRET,
      userId: CREATOR_ID,
      proof,
      proofVerifier,
    });

    expect(result.listing).toMatchObject({
      id: LISTING_ID,
      status: "claimed",
      claimedByUserId: CREATOR_ID,
    });
    expect(proofVerifier).toHaveBeenCalledWith(
      expect.objectContaining({ id: LISTING_ID }),
      proof,
    );
    expect(result.attestation).toEqual({
      ownershipModel: "channel_control",
      attestationVersion: "peertube-v1",
    });
    expect(update.sets).toHaveLength(1);
    expect(update.sets[0]).toMatchObject({
      claimedByUserId: CREATOR_ID,
      status: "claimed",
    });
    expect(update.sets[0].claimedAt).toBeInstanceOf(Date);
  });

  it("persists a verifier proof snapshot when actor-control proof succeeds", async () => {
    const proofSnapshot = {
      kind: "peertube_actor_token",
      verifier: "findling-peertube-proof-v1",
      proofUrl: "https://example.video/video-channels/creator",
      matchedField: "actor.summary",
      tokenHash: "sha256:abc",
      verifiedAt: "2026-06-24T10:01:00.000Z",
    };
    const claimed = listing({
      status: "claimed",
      claimedByUserId: CREATOR_ID,
      claimedAt: new Date("2026-06-24T10:01:00.000Z"),
      claimProofSnapshot: proofSnapshot,
    });
    mockSelectRows([listing()]);
    const update = mockClaimUpdate([claimed]);

    await claimListing({
      secret: CLAIM_SECRET,
      userId: CREATOR_ID,
      proof: { token: "ok" },
      proofVerifier: vi.fn(async () => ({
        verified: true,
        snapshot: proofSnapshot,
      })),
    });

    expect(update.sets[0]).toMatchObject({
      claimedByUserId: CREATOR_ID,
      status: "claimed",
      claimProofSnapshot: proofSnapshot,
    });
  });

  it("does not require actor-control proof for non-actor claim kinds", async () => {
    const source = listing({
      externalIdentityKind: "url",
      externalRef: "https://publisher.example/story",
      externalRefNormalized: "https://publisher.example/story",
    });
    const claimed = listing({
      ...source,
      status: "claimed",
      claimedByUserId: CREATOR_ID,
      claimedAt: new Date("2026-06-24T10:01:00.000Z"),
    });
    mockSelectRows([source]);
    mockClaimUpdate([claimed]);

    const result = await claimListing({
      secret: CLAIM_SECRET,
      userId: CREATOR_ID,
    });

    expect(result.listing.status).toBe("claimed");
    expect(result.attestation).toBeNull();
  });

  it("re-claim by the same user is an idempotent no-op", async () => {
    const alreadyClaimed = listing({
      status: "claimed",
      claimedByUserId: CREATOR_ID,
      claimedAt: new Date("2026-06-24T10:01:00.000Z"),
    });
    mockSelectRows([alreadyClaimed]);

    const result = await claimListing({
      secret: CLAIM_SECRET,
      userId: CREATOR_ID,
    });

    expect(result.listing).toMatchObject({
      id: LISTING_ID,
      status: "claimed",
      claimedByUserId: CREATOR_ID,
    });
    expect(fakeDb.update).not.toHaveBeenCalled();
  });

  it("does not let another user claim an already claimed listing", async () => {
    mockSelectRows([
      listing({
        status: "claimed",
        claimedByUserId: OTHER_CREATOR_ID,
      }),
    ]);

    await expect(
      claimListing({ secret: CLAIM_SECRET, userId: CREATOR_ID }),
    ).rejects.toMatchObject({ reason: "listing_not_claimable" });
  });
});

describe("claim session route helpers", () => {
  const sessionActor = {
    userId: CREATOR_ID,
    via: "session" as const,
    roles: [],
    address: "0xcreator",
  };
  const agentActor = {
    userId: CREATOR_ID,
    via: "agent" as const,
    roles: ["buyer"],
    address: "0xagent",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    process.env.AUTH_SESSION_SECRET = TEST_AUTH_SECRET;
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("GET returns public claim metadata and never leaks the secret hash", async () => {
    const res = await getClaimSessionResponse(CLAIM_SECRET, {
      get: vi.fn(async () => ({
        listing: {
          id: LISTING_ID,
          title: "Buzzer beater from the finals",
          externalIdentity: "@creator@example.video",
          externalIdentityKind: "peertube_channel" as const,
          externalRef: "https://example.video/video-channels/creator",
          sourceLicenceLabel: "CC BY-SA",
          status: "open" as const,
        },
        pledgedDemandMicroUsdc: 1_250_000,
        pledgeCount: 2,
        actorControlProof: {
          required: true as const,
          kind: "peertube_actor_token" as const,
          token: "fdl-claim-v1-token",
          externalRef: "https://example.video/video-channels/creator",
          acceptedFields: ["actor.summary", "video.support"] as const,
          instructions:
            "Paste this token into your public PeerTube channel description or a public video support field, then submit it back to Findling.",
        },
      })),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      listing: {
        id: LISTING_ID,
        title: "Buzzer beater from the finals",
        externalIdentity: "@creator@example.video",
        externalIdentityKind: "peertube_channel",
        externalRef: "https://example.video/video-channels/creator",
        sourceLicenceLabel: "CC BY-SA",
        status: "open",
      },
      pledgedDemandMicroUsdc: 1_250_000,
      pledgeCount: 2,
      actorControlProof: {
        required: true,
        kind: "peertube_actor_token",
        token: "fdl-claim-v1-token",
        externalRef: "https://example.video/video-channels/creator",
        acceptedFields: ["actor.summary", "video.support"],
        instructions:
          "Paste this token into your public PeerTube channel description or a public video support field, then submit it back to Findling.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("claimSecretHash");
  });

  it("POST default claim path rejects an actor-control claim with missing proof", async () => {
    mockSelectRows([listing()]);

    const res = await claimSessionResponse(sessionActor, CLAIM_SECRET, {});

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "invalid_claim",
      reason: "actor_proof_required",
    });
    expect(fakeDb.update).not.toHaveBeenCalled();
  });

  it("POST default claim path rejects an actor-control claim with an invalid proof", async () => {
    mockSelectRows([listing()]);

    const res = await claimSessionResponse(
      sessionActor,
      CLAIM_SECRET,
      { proof: { type: "peertube_actor_token", token: "wrong-token" } },
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "invalid_claim",
      reason: "actor_proof_required",
    });
    expect(fakeDb.update).not.toHaveBeenCalled();
  });

  it("POST default claim path accepts a valid public actor-control token", async () => {
    const token = claimVerificationTokenForListing(LISTING_ID);
    const claimed = listing({
      status: "claimed",
      claimedByUserId: CREATOR_ID,
      claimedAt: new Date("2026-06-24T10:01:00.000Z"),
    });
    mockSelectRows([listing()]);
    const update = mockClaimUpdate([claimed]);
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ summary: `Findling proof: ${token}` }), {
        status: 200,
        headers: { "content-type": "application/activity+json" },
      }),
    );

    const res = await claimSessionResponse(
      sessionActor,
      CLAIM_SECRET,
      { proof: { type: "peertube_actor_token", token } },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ listingId: LISTING_ID });
    expect(update.sets[0].claimProofSnapshot).toMatchObject({
      kind: "peertube_actor_token",
      verifier: "findling-peertube-proof-v1",
      proofUrl: "https://example.video/video-channels/creator",
      matchedField: "actor.summary",
    });
  });

  it("POST claim accepts only a human session actor", async () => {
    const claim = vi.fn(async () => ({
      listing: listing({ status: "claimed", claimedByUserId: CREATOR_ID }),
      attestation: {
        ownershipModel: "channel_control" as const,
        attestationVersion: "peertube-v1",
      },
    }));

    expect(
      (await claimSessionResponse(null, CLAIM_SECRET, {}, { claim })).status,
    ).toBe(401);
    expect(
      (await claimSessionResponse(agentActor, CLAIM_SECRET, {}, { claim })).status,
    ).toBe(403);

    const ok = await claimSessionResponse(
      sessionActor,
      CLAIM_SECRET,
      { proof: { actorToken: "ok" } },
      { claim },
    );

    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toEqual({ listingId: LISTING_ID });
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({
      secret: CLAIM_SECRET,
      userId: CREATOR_ID,
      proof: { actorToken: "ok" },
    }));
  });

  it("maps claim validation reasons without exposing internals", async () => {
    const claim = vi.fn(async () => {
      throw new ClaimValidationError("finder_cannot_claim_own_listing");
    });

    const res = await claimSessionResponse(
      sessionActor,
      CLAIM_SECRET,
      {},
      { claim },
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "invalid_claim",
      reason: "finder_cannot_claim_own_listing",
    });
  });
});

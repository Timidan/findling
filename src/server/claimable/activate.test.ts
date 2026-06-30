import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeDb = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
}));

const fakeFindLicensableMoment = vi.hoisted(() => vi.fn());

vi.mock("../db/client", () => ({ db: fakeDb }));
vi.mock("../catalog/licensable", () => ({
  findLicensableMoment: fakeFindLicensableMoment,
}));

import {
  activateListing,
  ActivationValidationError,
  CLAIMABLE_RUN_STARTED_AT,
} from "./activate";
import { activateClaimResponse } from "../../app/api/claim/[token]/activate/route";

const FINDER_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const BUYER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_BUYER_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_CREATOR_ID = "55555555-5555-4555-8555-555555555555";
const LISTING_ID = "66666666-6666-4666-8666-666666666666";
const MOMENT_ID = "77777777-7777-4777-8777-777777777777";
const ASSET_ID = "88888888-8888-4888-8888-888888888888";
const GRANT_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_GRANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INTENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_INTENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CURATION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RUN_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER_RUN_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const CLAIM_SECRET = "claim-secret";

function momentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MOMENT_ID,
    assetId: ASSET_ID,
    creatorId: CREATOR_ID,
    status: "published",
    clipStorageKey: "moments/clip.mp4",
    ownershipVerified: true,
    attestationAt: new Date("2026-06-24T09:59:00.000Z"),
    ...overrides,
  };
}

function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    creatorId: CREATOR_ID,
    status: "published",
    ...overrides,
  };
}

function listingRow(overrides: Record<string, unknown> = {}) {
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
    claimSecretHash: "stored-hash",
    status: "claimed",
    claimedByUserId: CREATOR_ID,
    claimedAt: new Date("2026-06-24T10:00:00.000Z"),
    createdMomentId: null,
    expiresAt: null,
    createdAt: new Date("2026-06-24T09:00:00.000Z"),
    updatedAt: new Date("2026-06-24T10:00:00.000Z"),
    ...overrides,
  };
}

function intentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INTENT_ID,
    listingId: LISTING_ID,
    buyerId: BUYER_ID,
    sessionGrantId: GRANT_ID,
    budgetMicroUsdc: 600_000,
    usageType: "video_embed",
    status: "pledged",
    agentRunId: null,
    settledPurchaseId: null,
    expiresAt: null,
    createdAt: new Date("2026-06-24T09:05:00.000Z"),
    updatedAt: new Date("2026-06-24T09:05:00.000Z"),
    ...overrides,
  };
}

function curationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CURATION_ID,
    momentId: MOMENT_ID,
    finderId: FINDER_ID,
    tags: [],
    caption: null,
    useCaseNote: null,
    shareSlug: "c-claimabletest",
    sourceSurface: "feed",
    relevanceText: "Buzzer beater from the finals",
    createdAt: new Date("2026-06-24T10:01:00.000Z"),
    updatedAt: new Date("2026-06-24T10:01:00.000Z"),
    ...overrides,
  };
}

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    buyerId: BUYER_ID,
    sessionGrantId: GRANT_ID,
    surface: "feed",
    requestText: `claimable:${LISTING_ID}`,
    candidateMomentIds: [MOMENT_ID],
    candidateScores: [{ momentId: MOMENT_ID, score: 1 }],
    budgetMicroUsdc: 600_000,
    paymentStatus: "requires_payment",
    startedAt: new Date("2026-06-24T10:01:00.010Z"),
    ...overrides,
  };
}

function mockSelectRows(rows: Record<string, unknown>[]) {
  fakeDb.select.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => rows),
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => rows),
        })),
      })),
      orderBy: vi.fn(() => ({
        limit: vi.fn(async () => rows),
      })),
    })),
  });
}

function mockActivationPreamble(listing = listingRow()) {
  const moment = momentRow();
  const asset = assetRow();
  mockSelectRows([moment]);
  fakeFindLicensableMoment.mockResolvedValueOnce({ moment, asset });
  mockSelectRows([listing]);
}

function mockActivationTx() {
  const curationValues: Record<string, unknown>[] = [];
  const runValues: Record<string, unknown>[] = [];
  const listingUpdateValues: Record<string, unknown>[] = [];
  const intentUpdateValues: Record<string, unknown>[] = [];

  const intents = [
    intentRow(),
    intentRow({
      id: OTHER_INTENT_ID,
      buyerId: OTHER_BUYER_ID,
      sessionGrantId: OTHER_GRANT_ID,
      budgetMicroUsdc: 750_000,
    }),
  ];
  const curation = curationRow();
  const runs = [
    runRow(),
    runRow({
      id: OTHER_RUN_ID,
      buyerId: OTHER_BUYER_ID,
      sessionGrantId: OTHER_GRANT_ID,
      budgetMicroUsdc: 750_000,
      startedAt: new Date("2026-06-24T10:01:00.020Z"),
    }),
  ];

  let updateCall = 0;
  let insertCall = 0;
  const tx = {
    update: vi.fn(() => {
      const call = ++updateCall;
      return {
        set: vi.fn((values: Record<string, unknown>) => {
          if (call === 1) listingUpdateValues.push(values);
          else intentUpdateValues.push(values);
          return {
            where: vi.fn(() => ({
              returning: vi.fn(async () =>
                call === 1
                  ? [
                      listingRow({
                        status: "activated",
                        createdMomentId: MOMENT_ID,
                      }),
                    ]
                  : [intentRow({ status: "notified" })],
              ),
            })),
          };
        }),
      };
    }),
    insert: vi.fn(() => {
      const call = ++insertCall;
      return {
        values: vi.fn((values: Record<string, unknown>) => {
          if (call === 1) curationValues.push(values);
          else runValues.push(values);
          return {
            returning: vi.fn(async () =>
              call === 1 ? [curation] : [runs[call - 2]],
            ),
          };
        }),
      };
    }),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => intents),
      })),
    })),
  };

  fakeDb.transaction.mockImplementationOnce(async (callback) => callback(tx));

  return {
    curation,
    runs,
    tx,
    curationValues,
    runValues,
    listingUpdateValues,
    intentUpdateValues,
  };
}

describe("activateListing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects activation by a user who does not own the moment", async () => {
    mockSelectRows([momentRow({ creatorId: OTHER_CREATOR_ID })]);

    await expect(
      activateListing({
        listingId: LISTING_ID,
        userId: CREATOR_ID,
        momentId: MOMENT_ID,
      }),
    ).rejects.toMatchObject({ reason: "not_moment_owner" });
    expect(fakeFindLicensableMoment).not.toHaveBeenCalled();
  });

  it("rejects a draft or otherwise non-licensable moment", async () => {
    mockSelectRows([momentRow({ status: "draft", clipStorageKey: null })]);
    fakeFindLicensableMoment.mockResolvedValueOnce(null);

    await expect(
      activateListing({
        listingId: LISTING_ID,
        userId: CREATOR_ID,
        momentId: MOMENT_ID,
      }),
    ).rejects.toMatchObject({ reason: "moment_not_licensable" });
  });

  it("creates exactly one curation, one run per pledged intent, and strictly orders curation before runs", async () => {
    mockActivationPreamble();
    const tx = mockActivationTx();

    const summary = await activateListing({
      listingId: LISTING_ID,
      userId: CREATOR_ID,
      momentId: MOMENT_ID,
    });

    expect(summary).toEqual({
      listingId: LISTING_ID,
      momentId: MOMENT_ID,
      curationId: CURATION_ID,
      notifiedCount: 2,
    });

    expect(tx.curationValues).toHaveLength(1);
    expect(tx.curationValues[0]).toMatchObject({
      momentId: MOMENT_ID,
      finderId: FINDER_ID,
      sourceSurface: "feed",
      relevanceText: "Buzzer beater from the finals",
    });

    expect(tx.runValues).toHaveLength(2);
    expect(tx.runValues[0]).toMatchObject({
      buyerId: BUYER_ID,
      sessionGrantId: GRANT_ID,
      surface: "feed",
      requestText: `claimable:${LISTING_ID}`,
      candidateMomentIds: [MOMENT_ID],
      candidateScores: [{ momentId: MOMENT_ID, score: 1 }],
      budgetMicroUsdc: 600_000,
      paymentStatus: "requires_payment",
    });
    expect(tx.runValues[1]).toMatchObject({
      buyerId: OTHER_BUYER_ID,
      sessionGrantId: OTHER_GRANT_ID,
      budgetMicroUsdc: 750_000,
    });
    expect(tx.runValues.map((values) => values.startedAt)).toEqual([
      CLAIMABLE_RUN_STARTED_AT,
      CLAIMABLE_RUN_STARTED_AT,
    ]);
    for (const run of tx.runs) {
      expect(tx.curation.createdAt.getTime()).toBeLessThan(
        run.startedAt.getTime(),
      );
    }

    expect(tx.listingUpdateValues).toHaveLength(1);
    expect(tx.listingUpdateValues[0]).toMatchObject({
      status: "activated",
      createdMomentId: MOMENT_ID,
    });
    expect(tx.intentUpdateValues).toEqual([
      expect.objectContaining({ status: "notified", agentRunId: RUN_ID }),
      expect.objectContaining({ status: "notified", agentRunId: OTHER_RUN_ID }),
    ]);
  });

  it("treats a second activate call as an idempotent no-op with no duplicate curation or runs", async () => {
    mockActivationPreamble(
      listingRow({
        status: "activated",
        createdMomentId: MOMENT_ID,
      }),
    );
    mockSelectRows([curationRow()]);
    mockSelectRows([{ notifiedCount: "2" }]);

    const summary = await activateListing({
      listingId: LISTING_ID,
      userId: CREATOR_ID,
      momentId: MOMENT_ID,
    });

    expect(summary).toEqual({
      listingId: LISTING_ID,
      momentId: MOMENT_ID,
      curationId: CURATION_ID,
      notifiedCount: 2,
    });
    expect(fakeDb.transaction).not.toHaveBeenCalled();
  });
});

describe("activate claim session route helper", () => {
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

  it("accepts only a human session actor and resolves the listing by claim token", async () => {
    const resolve = vi.fn(async () => listingRow());
    const activate = vi.fn(async () => ({
      listingId: LISTING_ID,
      momentId: MOMENT_ID,
      curationId: CURATION_ID,
      notifiedCount: 2,
    }));

    expect(
      (await activateClaimResponse(null, CLAIM_SECRET, { momentId: MOMENT_ID }, {
        resolve,
        activate,
      })).status,
    ).toBe(401);
    expect(
      (
        await activateClaimResponse(
          agentActor,
          CLAIM_SECRET,
          { momentId: MOMENT_ID },
          { resolve, activate },
        )
      ).status,
    ).toBe(403);

    const ok = await activateClaimResponse(
      sessionActor,
      CLAIM_SECRET,
      { momentId: MOMENT_ID },
      { resolve, activate },
    );

    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toEqual({
      listingId: LISTING_ID,
      momentId: MOMENT_ID,
      curationId: CURATION_ID,
      notifiedCount: 2,
    });
    expect(resolve).toHaveBeenCalledWith(CLAIM_SECRET);
    expect(activate).toHaveBeenCalledWith({
      listingId: LISTING_ID,
      userId: CREATOR_ID,
      momentId: MOMENT_ID,
    });
  });

  it("maps activation validation reasons without exposing internals", async () => {
    const resolve = vi.fn(async () => listingRow());
    const activate = vi.fn(async () => {
      throw new ActivationValidationError("moment_not_licensable");
    });

    const res = await activateClaimResponse(
      sessionActor,
      CLAIM_SECRET,
      { momentId: MOMENT_ID },
      { resolve, activate },
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "invalid_activation",
      reason: "moment_not_licensable",
    });
  });
});

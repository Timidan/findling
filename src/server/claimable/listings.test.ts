import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeDb = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../db/client", () => ({ db: fakeDb }));

import {
  createListing,
  listListings,
  type ClaimableListingView,
} from "./listings";
import {
  createListingResponse,
  listListingsResponse,
} from "../../app/api/agent/listings/route";

const FINDER_ID = "11111111-1111-4111-8111-111111111111";
const BUYER_ID = "22222222-2222-4222-8222-222222222222";

const createInput = {
  externalIdentity: "@creator@example.video",
  externalIdentityKind: "peertube_channel",
  externalRef: " HTTPS://Example.Video/video-channels/Creator ",
  title: "Buzzer beater from the finals",
  description: "Need the final shot from the fourth quarter.",
  relevanceText: "Basketball recap agents are requesting this moment.",
} as const;

function listingRow(
  overrides: Partial<ClaimableListingView> & { claimSecretHash?: string } = {},
) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    finderId: FINDER_ID,
    externalIdentity: createInput.externalIdentity,
    externalIdentityKind: createInput.externalIdentityKind,
    externalRef: "HTTPS://Example.Video/video-channels/Creator",
    externalRefNormalized: "https://example.video/video-channels/creator",
    title: createInput.title,
    description: createInput.description,
    relevanceText: createInput.relevanceText,
    sourceLicenceLabel: "CC BY-SA",
    claimSecretHash: "stored-hash",
    status: "open",
    claimedByUserId: null,
    claimedAt: null,
    createdMomentId: null,
    expiresAt: null,
    createdAt: new Date("2026-06-24T10:00:00.000Z"),
    updatedAt: new Date("2026-06-24T10:00:00.000Z"),
    ...overrides,
  };
}

function mockInsertReturning(
  buildRow: (values: Record<string, unknown>) => Record<string, unknown>,
) {
  fakeDb.insert.mockReturnValue({
    values: vi.fn((values: Record<string, unknown>) => ({
      returning: vi.fn(async () => [buildRow(values)]),
    })),
  });
}

function mockListRows(
  rows: Record<string, unknown>[],
  demandRows: Record<string, unknown>[] = [],
) {
  fakeDb.select.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => rows),
        })),
      })),
    })),
  });
  if (rows.length > 0) {
    fakeDb.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            groupBy: vi.fn(async () => demandRows),
          })),
        })),
      })),
    });
  }
}

describe("createListing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a one-time claim secret while storing only its sha256 hash", async () => {
    const insertedRows: Record<string, unknown>[] = [];
    mockInsertReturning((values) => {
      insertedRows.push(values);
      return listingRow({ claimSecretHash: String(values.claimSecretHash) });
    });

    const result = await createListing(FINDER_ID, createInput);
    const inserted = insertedRows[0];

    expect(result.claimSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(inserted.claimSecretHash).toBe(
      createHash("sha256").update(result.claimSecret).digest("hex"),
    );
    expect(inserted.externalRefNormalized).toBe(
      "https://example.video/video-channels/creator",
    );
    expect(result.listing).not.toHaveProperty("claimSecretHash");
    expect(JSON.stringify(result.listing)).not.toContain(result.claimSecret);
  });
});

describe("listListings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns public creator metadata and integer micro-USDC totals", async () => {
    mockListRows([
      {
        ...listingRow(),
      },
    ], [
      {
        listingId: "33333333-3333-4333-8333-333333333333",
        sessionGrantId: "55555555-5555-4555-8555-555555555555",
        remainingCapMicroUsdc: "3000000",
        pledgedBudgetMicroUsdc: "2500000",
        pledgeCount: "2",
      },
    ]);

    await expect(listListings({ audience: "public" })).resolves.toEqual({
      listings: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          title: "Buzzer beater from the finals",
          externalIdentity: "@creator@example.video",
          externalIdentityKind: "peertube_channel",
          sourceLicenceLabel: "CC BY-SA",
          pledgedDemandMicroUsdc: 2_500_000,
          pledgeCount: 2,
          status: "open",
        },
      ],
    });
  });

  it("keeps the agent demand feed projection minimal", async () => {
    mockListRows([
      {
        ...listingRow(),
      },
    ], [
      {
        listingId: "33333333-3333-4333-8333-333333333333",
        sessionGrantId: "55555555-5555-4555-8555-555555555555",
        remainingCapMicroUsdc: "3000000",
        pledgedBudgetMicroUsdc: "2500000",
        pledgeCount: "2",
      },
    ]);

    await expect(listListings({ audience: "agent" })).resolves.toEqual({
      listings: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          title: "Buzzer beater from the finals",
          pledgedDemandMicroUsdc: 2_500_000,
          pledgeCount: 2,
          status: "open",
        },
      ],
    });
  });
});

describe("agent listing route role checks", () => {
  const finderAgent = {
    userId: FINDER_ID,
    via: "agent" as const,
    roles: ["finder"],
    address: "0xfinder",
  };
  const buyerAgent = {
    userId: BUYER_ID,
    via: "agent" as const,
    roles: ["buyer"],
    address: "0xbuyer",
  };
  const sessionActor = {
    userId: FINDER_ID,
    via: "session" as const,
    roles: [],
    address: "0xsession",
  };

  it("allows POST create only for finder agents and returns a claim URL", async () => {
    const create = vi.fn(async () => ({
      listing: listingRow() as ClaimableListingView,
      claimSecret: "raw-secret",
    }));

    expect(
      (await createListingResponse(null, createInput, "https://findling.test", { create }))
        .status,
    ).toBe(401);
    expect(
      (
        await createListingResponse(sessionActor, createInput, "https://findling.test", {
          create,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await createListingResponse(buyerAgent, createInput, "https://findling.test", {
          create,
        })
      ).status,
    ).toBe(403);

    const ok = await createListingResponse(
      finderAgent,
      createInput,
      "https://findling.test",
      { create },
    );

    expect(ok.status).toBe(201);
    await expect(ok.json()).resolves.toMatchObject({
      claimUrl: "https://findling.test/claim/raw-secret",
      listing: { id: "33333333-3333-4333-8333-333333333333" },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenLastCalledWith(FINDER_ID, createInput);
  });

  it("allows GET feed for any authenticated agent", async () => {
    const list = vi.fn(async () => ({
      listings: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          title: createInput.title,
          pledgedDemandMicroUsdc: 0,
          pledgeCount: 0,
          status: "open" as const,
        },
      ],
    }));

    expect((await listListingsResponse(null, { list })).status).toBe(401);
    expect((await listListingsResponse(sessionActor, { list })).status).toBe(403);

    const buyer = await listListingsResponse(buyerAgent, { list });
    const finder = await listListingsResponse(finderAgent, { list });

    expect(buyer.status).toBe(200);
    expect(finder.status).toBe(200);
    await expect(buyer.json()).resolves.toEqual({
      listings: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          title: createInput.title,
          pledgedDemandMicroUsdc: 0,
          pledgeCount: 0,
          status: "open",
        },
      ],
    });
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledWith({ audience: "agent" });
  });
});

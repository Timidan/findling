import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeDb = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../db/client", () => ({ db: fakeDb }));

import { listListings } from "./listings";
import {
  getPledgedDemand,
  listPledges,
  pledgeIntent,
  PledgeValidationError,
  type BuyerPledgeView,
  type DemandIntentView,
} from "./pledges";
import {
  pledgeListingResponse,
} from "../../app/api/agent/listings/[id]/pledge/route";
import { listPledgesResponse } from "../../app/api/agent/pledges/route";

const BUYER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_BUYER_ID = "44444444-4444-4444-8444-444444444444";
const FINDER_ID = "11111111-1111-4111-8111-111111111111";
const LISTING_ID = "33333333-3333-4333-8333-333333333333";
const GRANT_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_GRANT_ID = "66666666-6666-4666-8666-666666666666";
const INTENT_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_LISTING_ID = "88888888-8888-4888-8888-888888888888";
const MOMENT_ID = "99999999-9999-4999-8999-999999999999";
const AGENT_RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PURCHASE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const APP_BASE_URL = "https://findling.example";
const ORIGINAL_APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL;

function activeGrant(overrides: Record<string, unknown> = {}) {
  return {
    id: GRANT_ID,
    buyerId: BUYER_ID,
    status: "active",
    expiresAt: null,
    remainingCapMicroUsdc: 1_000_000,
    ...overrides,
  };
}

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: LISTING_ID,
    finderId: FINDER_ID,
    status: "open",
    title: "Buzzer beater from the finals",
    createdAt: new Date("2026-06-24T10:00:00.000Z"),
    externalIdentity: "@creator@example.video",
    externalIdentityKind: "peertube_channel",
    sourceLicenceLabel: "CC BY-SA",
    ...overrides,
  };
}

function intent(overrides: Partial<DemandIntentView> = {}): DemandIntentView {
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
    createdAt: new Date("2026-06-24T10:00:00.000Z"),
    updatedAt: new Date("2026-06-24T10:00:00.000Z"),
    ...overrides,
  };
}

function pledgeListRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INTENT_ID,
    listingId: LISTING_ID,
    sessionGrantId: GRANT_ID,
    status: "pledged",
    agentRunId: null,
    settledPurchaseId: null,
    createdMomentId: null,
    createdAt: new Date("2026-06-24T10:00:00.000Z"),
    ...overrides,
  };
}

function mockSelectOnce(rows: Record<string, unknown>[]) {
  fakeDb.select.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => rows),
        groupBy: vi.fn(async () => rows),
        orderBy: vi.fn(async () => rows),
      })),
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          groupBy: vi.fn(async () => rows),
        })),
      })),
    })),
  });
}

function mockPledgeListRows(rows: Record<string, unknown>[]) {
  fakeDb.select.mockReturnValueOnce({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => rows),
        })),
      })),
      where: vi.fn(() => ({
        orderBy: vi.fn(async () => rows),
      })),
    })),
  });
}

function mockSettledPurchaseRows(rows: Record<string, unknown>[]) {
  fakeDb.select.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(async () => rows),
        limit: vi.fn(async () => rows),
      })),
    })),
  });
}

function mockUpdateIntent(row: Record<string, unknown> | null) {
  const returning = vi.fn(async () => (row ? [row] : []));
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  fakeDb.update.mockReturnValueOnce({ set });
  return { set, where, returning };
}

function mockDemandRows(rows: Record<string, unknown>[]) {
  fakeDb.select.mockReturnValueOnce({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          groupBy: vi.fn(async () => rows),
        })),
      })),
    })),
  });
}

function mockListingRows(rows: Record<string, unknown>[]) {
  fakeDb.select.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => rows),
        })),
      })),
    })),
  });
}

function mockInsertIntent(row: DemandIntentView) {
  const returning = vi.fn(async () => [row]);
  const onConflictDoUpdate = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  fakeDb.insert.mockReturnValueOnce({ values });
  return { values, onConflictDoUpdate, returning };
}

describe("getPledgedDemand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("caps two 0.60 USDC pledges backed by one 1.00 USDC grant at 1.00 USDC, not 1.20", async () => {
    mockDemandRows([
      {
        listingId: LISTING_ID,
        sessionGrantId: GRANT_ID,
        remainingCapMicroUsdc: "1000000",
        pledgedBudgetMicroUsdc: "1200000",
        pledgeCount: "2",
      },
    ]);

    await expect(getPledgedDemand(LISTING_ID)).resolves.toEqual({
      pledgedDemandMicroUsdc: 1_000_000,
      pledgeCount: 2,
    });
  });

  it("sums pledges backed by different funded grants normally", async () => {
    mockDemandRows([
      {
        listingId: LISTING_ID,
        sessionGrantId: GRANT_ID,
        remainingCapMicroUsdc: "1000000",
        pledgedBudgetMicroUsdc: "600000",
        pledgeCount: "1",
      },
      {
        listingId: LISTING_ID,
        sessionGrantId: OTHER_GRANT_ID,
        remainingCapMicroUsdc: "1000000",
        pledgedBudgetMicroUsdc: "600000",
        pledgeCount: "1",
      },
    ]);

    await expect(getPledgedDemand(LISTING_ID)).resolves.toEqual({
      pledgedDemandMicroUsdc: 1_200_000,
      pledgeCount: 2,
    });
  });
});

describe("pledgeIntent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects inactive or expired grants as not pledgeable", async () => {
    mockSelectOnce([activeGrant({ status: "revoked" })]);
    await expect(
      pledgeIntent({
        buyerId: BUYER_ID,
        listingId: LISTING_ID,
        sessionGrantId: GRANT_ID,
        budgetMicroUsdc: 600_000,
      }),
    ).rejects.toMatchObject({ reason: "grant_not_pledgeable" });

    mockSelectOnce([activeGrant({ expiresAt: new Date("2000-01-01T00:00:00.000Z") })]);
    await expect(
      pledgeIntent({
        buyerId: BUYER_ID,
        listingId: LISTING_ID,
        sessionGrantId: GRANT_ID,
        budgetMicroUsdc: 600_000,
      }),
    ).rejects.toMatchObject({ reason: "grant_not_pledgeable" });
  });

  it("rejects a grant that is not owned by the buyer", async () => {
    mockSelectOnce([activeGrant({ buyerId: OTHER_BUYER_ID })]);

    await expect(
      pledgeIntent({
        buyerId: BUYER_ID,
        listingId: LISTING_ID,
        sessionGrantId: GRANT_ID,
        budgetMicroUsdc: 600_000,
      }),
    ).rejects.toMatchObject({ reason: "grant_not_owner" });
  });

  it("updates and returns one intent for repeat pledges by the same buyer and listing", async () => {
    mockSelectOnce([activeGrant()]);
    mockSelectOnce([listing()]);
    const firstUpsert = mockInsertIntent(intent());

    const first = await pledgeIntent({
      buyerId: BUYER_ID,
      listingId: LISTING_ID,
      sessionGrantId: GRANT_ID,
      budgetMicroUsdc: 600_000,
      usageType: "video_embed",
    });

    mockSelectOnce([activeGrant()]);
    mockSelectOnce([listing()]);
    const secondUpsert = mockInsertIntent(intent({ budgetMicroUsdc: 900_000 }));

    const second = await pledgeIntent({
      buyerId: BUYER_ID,
      listingId: LISTING_ID,
      sessionGrantId: GRANT_ID,
      budgetMicroUsdc: 900_000,
      usageType: "newsletter",
    });

    expect(new Set([first.id, second.id])).toEqual(new Set([INTENT_ID]));
    expect(first.budgetMicroUsdc).toBe(600_000);
    expect(second.budgetMicroUsdc).toBe(900_000);
    expect(firstUpsert.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(secondUpsert.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(firstUpsert.returning).toHaveBeenCalledTimes(1);
    expect(secondUpsert.returning).toHaveBeenCalledTimes(1);
  });

  it("rejects pledges once a listing is activated or expired", async () => {
    for (const status of ["activated", "expired"] as const) {
      mockSelectOnce([activeGrant()]);
      mockSelectOnce([listing({ status })]);

      await expect(
        pledgeIntent({
          buyerId: BUYER_ID,
          listingId: LISTING_ID,
          sessionGrantId: GRANT_ID,
          budgetMicroUsdc: 600_000,
        }),
      ).rejects.toMatchObject({ reason: "listing_not_pledgeable" });
    }
  });

  it("snapshots budget, usage type, and starts pledged without moving money", async () => {
    mockSelectOnce([activeGrant()]);
    mockSelectOnce([listing({ status: "claimed" })]);
    const upsert = mockInsertIntent(intent({ budgetMicroUsdc: 750_000, usageType: "social_post" }));

    await expect(
      pledgeIntent({
        buyerId: BUYER_ID,
        listingId: LISTING_ID,
        sessionGrantId: GRANT_ID,
        budgetMicroUsdc: 750_000,
        usageType: "social_post",
      }),
    ).resolves.toMatchObject({
      id: INTENT_ID,
      budgetMicroUsdc: 750_000,
      usageType: "social_post",
      status: "pledged",
    });

    expect(upsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerId: BUYER_ID,
        listingId: LISTING_ID,
        sessionGrantId: GRANT_ID,
        budgetMicroUsdc: 750_000,
        usageType: "social_post",
        status: "pledged",
      }),
    );
  });
});

describe("listPledges", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = APP_BASE_URL;
  });

  afterEach(() => {
    if (ORIGINAL_APP_BASE_URL === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_BASE_URL;
    }
  });

  it("returns only the buyer pledge projection with null unlock URLs before activation", async () => {
    mockPledgeListRows([
      pledgeListRow({ status: "pledged" }),
      pledgeListRow({
        id: "99999999-9999-4999-9999-999999999999",
        listingId: OTHER_LISTING_ID,
        status: "notified",
      }),
    ]);

    await expect(listPledges(BUYER_ID)).resolves.toEqual({
      pledges: [
        { listingId: LISTING_ID, status: "pledged", unlockUrl: null },
        {
          listingId: OTHER_LISTING_ID,
          status: "notified",
          unlockUrl: null,
        },
      ] satisfies BuyerPledgeView[],
    });
  });

  it("returns a payable unlock URL for a notified pledge", async () => {
    mockPledgeListRows([
      pledgeListRow({
        status: "notified",
        agentRunId: AGENT_RUN_ID,
        createdMomentId: MOMENT_ID,
      }),
    ]);
    mockSettledPurchaseRows([]);

    const result = await listPledges(BUYER_ID);

    expect(result.pledges).toHaveLength(1);
    const unlockUrl = result.pledges[0]?.unlockUrl;
    expect(unlockUrl).not.toBeNull();

    const parsed = new URL(unlockUrl!);
    expect(parsed.origin).toBe(APP_BASE_URL);
    expect(parsed.pathname).toBe(
      `/api/payments/x402/moments/${MOMENT_ID}/unlock`,
    );
    expect(parsed.searchParams.get("grantId")).toBe(GRANT_ID);
    expect(parsed.searchParams.get("agentRunId")).toBe(AGENT_RUN_ID);
  });

  it("reconciles a notified pledge to settled when its agent run has a settled purchase and is idempotent", async () => {
    mockPledgeListRows([
      pledgeListRow({
        status: "notified",
        agentRunId: AGENT_RUN_ID,
        createdMomentId: MOMENT_ID,
      }),
    ]);
    mockSettledPurchaseRows([{ id: PURCHASE_ID }]);
    const update = mockUpdateIntent({
      id: INTENT_ID,
      status: "settled",
      settledPurchaseId: PURCHASE_ID,
    });
    mockPledgeListRows([
      pledgeListRow({
        status: "settled",
        agentRunId: AGENT_RUN_ID,
        createdMomentId: MOMENT_ID,
        settledPurchaseId: PURCHASE_ID,
      }),
    ]);

    const first = await listPledges(BUYER_ID);
    const second = await listPledges(BUYER_ID);

    expect(first.pledges).toEqual([
      { listingId: LISTING_ID, status: "settled", unlockUrl: null },
    ]);
    expect(second.pledges).toEqual([
      { listingId: LISTING_ID, status: "settled", unlockUrl: null },
    ]);
    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "settled",
        settledPurchaseId: PURCHASE_ID,
        updatedAt: expect.any(Date),
      }),
    );
    expect(fakeDb.update).toHaveBeenCalledTimes(1);
  });

  it("does not reconcile or expose an unlock URL for a pledged pre-activation pledge", async () => {
    mockPledgeListRows([pledgeListRow({ status: "pledged" })]);

    await expect(listPledges(BUYER_ID)).resolves.toEqual({
      pledges: [{ listingId: LISTING_ID, status: "pledged", unlockUrl: null }],
    });
    expect(fakeDb.select).toHaveBeenCalledTimes(1);
    expect(fakeDb.update).not.toHaveBeenCalled();
  });
});

describe("buyer pledge routes", () => {
  const buyerAgent = {
    userId: BUYER_ID,
    via: "agent" as const,
    roles: ["buyer"],
    address: "0xbuyer",
  };
  const finderAgent = {
    userId: FINDER_ID,
    via: "agent" as const,
    roles: ["finder"],
    address: "0xfinder",
  };
  const sessionActor = {
    userId: BUYER_ID,
    via: "session" as const,
    roles: [],
    address: "0xsession",
  };

  it("allows POST pledge only for buyer agents", async () => {
    const pledge = vi.fn(async () => intent());
    const body = {
      sessionGrantId: GRANT_ID,
      budgetMicroUsdc: 600_000,
      usageType: "video_embed",
    };

    expect((await pledgeListingResponse(null, LISTING_ID, body, { pledge })).status).toBe(401);
    expect(
      (await pledgeListingResponse(sessionActor, LISTING_ID, body, { pledge })).status,
    ).toBe(403);
    expect(
      (await pledgeListingResponse(finderAgent, LISTING_ID, body, { pledge })).status,
    ).toBe(403);

    const ok = await pledgeListingResponse(buyerAgent, LISTING_ID, body, { pledge });

    expect(ok.status).toBe(201);
    await expect(ok.json()).resolves.toMatchObject({
      intent: {
        id: INTENT_ID,
        buyerId: BUYER_ID,
        listingId: LISTING_ID,
        sessionGrantId: GRANT_ID,
        budgetMicroUsdc: 600_000,
        usageType: "video_embed",
        status: "pledged",
      },
    });
    expect(pledge).toHaveBeenCalledTimes(1);
    expect(pledge).toHaveBeenCalledWith({
      buyerId: BUYER_ID,
      listingId: LISTING_ID,
      sessionGrantId: GRANT_ID,
      budgetMicroUsdc: 600_000,
      usageType: "video_embed",
    });
  });

  it("allows GET pledge list only for buyer agents", async () => {
    const list = vi.fn(async () => ({
      pledges: [{ listingId: LISTING_ID, status: "pledged" as const, unlockUrl: null }],
    }));

    expect((await listPledgesResponse(null, { list })).status).toBe(401);
    expect((await listPledgesResponse(sessionActor, { list })).status).toBe(403);
    expect((await listPledgesResponse(finderAgent, { list })).status).toBe(403);

    const ok = await listPledgesResponse(buyerAgent, { list });

    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toEqual({
      pledges: [{ listingId: LISTING_ID, status: "pledged", unlockUrl: null }],
    });
    expect(list).toHaveBeenCalledWith(BUYER_ID);
  });

  it("maps pledge validation reasons without exposing non-buyer access", async () => {
    const pledge = vi.fn(async () => {
      throw new PledgeValidationError("grant_not_owner");
    });

    const res = await pledgeListingResponse(
      buyerAgent,
      LISTING_ID,
      { sessionGrantId: GRANT_ID, budgetMicroUsdc: 600_000 },
      { pledge },
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "invalid_pledge",
      reason: "grant_not_owner",
    });
  });
});

describe("listListings demand math", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses the same per-grant cap in the feed projection", async () => {
    mockListingRows([listing()]);
    mockDemandRows([
      {
        listingId: LISTING_ID,
        sessionGrantId: GRANT_ID,
        remainingCapMicroUsdc: "1000000",
        pledgedBudgetMicroUsdc: "1200000",
        pledgeCount: "2",
      },
    ]);

    await expect(listListings({ audience: "agent" })).resolves.toEqual({
      listings: [
        {
          id: LISTING_ID,
          title: "Buzzer beater from the finals",
          pledgedDemandMicroUsdc: 1_000_000,
          pledgeCount: 2,
          status: "open",
        },
      ],
    });
  });
});

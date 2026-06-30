import { beforeEach, describe, expect, it, vi } from "vitest";
import type { X402SellerPaymentAdapter } from "../payment";

const mocks = vi.hoisted(() => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  findLicensableMoment: vi.fn(),
  reserveGrantCap: vi.fn(),
  releaseGrantCap: vi.fn(),
  recordSettlement: vi.fn(),
  createSignedDownloadUrl: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({ db: mocks.db }));
vi.mock("@/server/db/schema", () => ({
  agentRuns: { id: "agent_runs.id" },
  buyerSessionGrants: { id: "buyer_session_grants.id" },
  curations: {
    createdAt: "curations.created_at",
    momentId: "curations.moment_id",
  },
  purchases: {
    buyerId: "purchases.buyer_id",
    id: "purchases.id",
    momentId: "purchases.moment_id",
    sessionGrantId: "purchases.session_grant_id",
    settledAt: "purchases.settled_at",
    status: "purchases.status",
  },
  purchaseReservations: {
    id: "purchase_reservations.id",
    status: "purchase_reservations.status",
  },
  receipts: { purchaseId: "receipts.purchase_id" },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  lt: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("@/server/catalog/licensable", () => ({
  findLicensableMoment: mocks.findLicensableMoment,
}));
vi.mock("@/server/grants/spend", () => ({
  reserveGrantCap: mocks.reserveGrantCap,
  releaseGrantCap: mocks.releaseGrantCap,
}));
vi.mock("@/server/ledger/settlement", () => ({
  recordSettlement: mocks.recordSettlement,
  SettlementError: class SettlementError extends Error {
    constructor(readonly reason: string) {
      super(reason);
      this.name = "SettlementError";
    }
  },
}));
vi.mock("@/server/storage/supabase-storage", () => ({
  supabaseStorage: {
    createSignedDownloadUrl: mocks.createSignedDownloadUrl,
  },
}));

import { runLicensePurchase } from "./license-purchase";

const MOMENT_ID = "99999999-9999-4999-8999-999999999999";
const ASSET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BUYER_ID = "22222222-2222-4222-8222-222222222222";
const CREATOR_ID = "11111111-1111-4111-8111-111111111111";
const GRANT_ID = "55555555-5555-4555-8555-555555555555";
const PURCHASE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RECEIPT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SESSION_KEY = "0x1111111111111111111111111111111111111111";
const OTHER_PAYER = "0x2222222222222222222222222222222222222222";
const PAYMENT_HEADER = "signed-x402-payload";

function moment() {
  return {
    id: MOMENT_ID,
    assetId: ASSET_ID,
    creatorId: CREATOR_ID,
    title: "Buzzer beater",
    priceMicroUsdc: 500_000,
    priceUsdSnapshot: "0.50",
    usageType: "video_embed",
    clipStorageKey: "moments/clip.mp4",
  };
}

function grant(overrides: Record<string, unknown> = {}) {
  return {
    id: GRANT_ID,
    buyerId: BUYER_ID,
    sessionKeyAddress: SESSION_KEY,
    allowedUsageTypes: null,
    ...overrides,
  };
}

function mockSelectRows(...rows: unknown[][]) {
  let i = 0;
  mocks.db.select.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(async () => rows[i++] ?? []),
    })),
  }));
}

function mockInsertReturning(row: Record<string, unknown>) {
  const returning = vi.fn(async () => [row]);
  const values = vi.fn(() => ({ returning }));
  mocks.db.insert.mockReturnValue({ values });
  return { values, returning };
}

function mockUpdateReturning(row: Record<string, unknown>) {
  const returning = vi.fn(async () => [row]);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  mocks.db.update.mockReturnValue({ set });
  return { set, where, returning };
}

function provider(
  overrides: Partial<X402SellerPaymentAdapter> = {},
): X402SellerPaymentAdapter {
  return {
    name: "gateway_x402",
    buildChallengeHeader: vi.fn(),
    verify: vi.fn(async () => ({ ok: true, payer: SESSION_KEY })),
    settle: vi.fn(async () => ({
      ok: true,
      paymentReference: "0xsettled",
      payerAddress: SESSION_KEY,
      network: "eip155:5042002",
    })),
    encodeSettlementHeader: vi.fn(() => "settlement-header"),
    ...overrides,
  };
}

describe("runLicensePurchase reservation hardening", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findLicensableMoment.mockResolvedValue({ moment: moment() });
    mocks.reserveGrantCap.mockResolvedValue(true);
    mocks.releaseGrantCap.mockResolvedValue(undefined);
    mocks.createSignedDownloadUrl.mockResolvedValue("https://signed.example/clip");
    mocks.recordSettlement.mockResolvedValue({
      reused: false,
      purchase: {
        id: PURCHASE_ID,
        momentId: MOMENT_ID,
        buyerId: BUYER_ID,
        creatorMicroUsdc: 400_000,
        finderMicroUsdc: 60_000,
        platformMicroUsdc: 40_000,
      },
      receipt: { id: RECEIPT_ID, receiptCode: "FND-TEST" },
    });
  });

  it("persists a pending reservation marker before settle and leaves cap held on settle exception", async () => {
    mockSelectRows([grant()]);
    const insert = mockInsertReturning({
      id: "reservation-1",
      status: "pending",
    });
    mockUpdateReturning({ id: "reservation-1", status: "pending" });
    const p = provider({
      settle: vi.fn(async () => {
        throw new Error("gateway timeout after broadcast");
      }),
    });

    const res = await runLicensePurchase({
      momentId: MOMENT_ID,
      grantId: GRANT_ID,
      agentRunId: null,
      origin: "https://findling.example",
      pathname: `/api/payments/x402/moments/${MOMENT_ID}/unlock`,
      paymentHeader: PAYMENT_HEADER,
      paymentProvider: p,
      sellerAddress: "0xseller",
    });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "settlement_error" });
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        momentId: MOMENT_ID,
        buyerId: BUYER_ID,
        sessionGrantId: GRANT_ID,
        amountMicroUsdc: 500_000,
        payerAddress: SESSION_KEY,
        paymentHeaderHash: expect.stringMatching(/^sha256:/),
        provider: "gateway_x402",
        status: "pending",
      }),
    );
    expect(insert.values.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(p.settle).mock.invocationCallOrder[0],
    );
    expect(mocks.reserveGrantCap).toHaveBeenCalledWith(GRANT_ID, 500_000);
    expect(mocks.releaseGrantCap).not.toHaveBeenCalled();
    expect(mocks.recordSettlement).not.toHaveBeenCalled();
  });

  it("rejects a settled payer that differs from the grant session key before recording or unlocking", async () => {
    mockSelectRows([grant()]);
    mockInsertReturning({
      id: "reservation-2",
      status: "pending",
    });
    mockUpdateReturning({ id: "reservation-2", status: "pending" });
    const p = provider({
      settle: vi.fn(async () => ({
        ok: true,
        paymentReference: "0xwrongpayer",
        payerAddress: OTHER_PAYER,
        network: "eip155:5042002",
      })),
    });

    const res = await runLicensePurchase({
      momentId: MOMENT_ID,
      grantId: GRANT_ID,
      agentRunId: null,
      origin: "https://findling.example",
      pathname: `/api/payments/x402/moments/${MOMENT_ID}/unlock`,
      paymentHeader: PAYMENT_HEADER,
      paymentProvider: p,
      sellerAddress: "0xseller",
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "settled_payer_mismatch" });
    expect(mocks.recordSettlement).not.toHaveBeenCalled();
    expect(mocks.createSignedDownloadUrl).not.toHaveBeenCalled();
    expect(mocks.releaseGrantCap).not.toHaveBeenCalled();
  });
});

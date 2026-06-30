import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  recordSettlement: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({ db: mocks.db }));
vi.mock("@/server/db/schema", () => ({
  agentRuns: { id: "agent_runs.id" },
  buyerSessionGrants: {
    id: "buyer_session_grants.id",
    remainingCapMicroUsdc: "buyer_session_grants.remaining_cap_micro_usdc",
    status: "buyer_session_grants.status",
  },
  curations: {
    createdAt: "curations.created_at",
    momentId: "curations.moment_id",
  },
  purchaseReservations: {
    id: "purchase_reservations.id",
    status: "purchase_reservations.status",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  eq: vi.fn(),
  lt: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("@/server/ledger/settlement", () => ({
  recordSettlement: mocks.recordSettlement,
}));

import { reconcilePendingPurchaseReservation } from "./purchase-reservation";

const RESERVATION_ID = "77777777-7777-4777-8777-777777777777";
const MOMENT_ID = "99999999-9999-4999-8999-999999999999";
const BUYER_ID = "22222222-2222-4222-8222-222222222222";
const GRANT_ID = "55555555-5555-4555-8555-555555555555";
const PURCHASE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_KEY = "0x1111111111111111111111111111111111111111";

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: RESERVATION_ID,
    momentId: MOMENT_ID,
    buyerId: BUYER_ID,
    sessionGrantId: GRANT_ID,
    agentRunId: null,
    amountMicroUsdc: 500_000,
    provider: "gateway_x402",
    sellerAddress: "0xseller",
    payerAddress: SESSION_KEY,
    paymentHeaderHash: "sha256:abc",
    status: "pending",
    ...overrides,
  };
}

function queueDbUpdates(...rows: Record<string, unknown>[][]) {
  const setCalls: Array<Record<string, unknown>> = [];
  mocks.db.update.mockImplementation(() => {
    const returning = vi.fn(async () => rows.shift() ?? []);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn((values: Record<string, unknown>) => {
      setCalls.push(values);
      return { where };
    });
    return { set };
  });
  return setCalls;
}

function queueTxUpdates(...rows: Record<string, unknown>[][]) {
  const setCalls: Array<Record<string, unknown>> = [];
  const tx = {
    update: vi.fn(() => {
      const returning = vi.fn(async () => rows.shift() ?? []);
      const where = vi.fn(() => ({ returning }));
      const set = vi.fn((values: Record<string, unknown>) => {
        setCalls.push(values);
        return { where };
      });
      return { set };
    }),
  };
  mocks.db.transaction.mockImplementation(async (fn) => fn(tx));
  return { tx, setCalls };
}

describe("purchase reservation reconciliation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.recordSettlement.mockResolvedValue({
      reused: false,
      purchase: { id: PURCHASE_ID },
      receipt: undefined,
    });
  });

  it("records a settled pending reservation through the existing settlement ledger path", async () => {
    const setCalls = queueDbUpdates(
      [reservation({ status: "recording" })],
      [reservation({ status: "settled", purchaseId: PURCHASE_ID })],
    );

    const row = await reconcilePendingPurchaseReservation({
      reservationId: RESERVATION_ID,
      outcome: "settled",
      paymentReference: "0xsettled",
      network: "eip155:5042002",
      payerAddress: SESSION_KEY,
      note: "confirmed on chain",
    });

    expect(mocks.recordSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        momentId: MOMENT_ID,
        buyerId: BUYER_ID,
        grossMicroUsdc: 500_000,
        sessionGrantId: GRANT_ID,
        provider: "gateway_x402",
        paymentReference: "0xsettled",
        network: "eip155:5042002",
        payerAddress: SESSION_KEY,
        sellerAddress: "0xseller",
        idempotencyKey: "gw:ref:0xsettled",
        capAlreadyReserved: true,
      }),
    );
    expect(setCalls[0]).toEqual(expect.objectContaining({ status: "recording" }));
    expect(setCalls[1]).toEqual(
      expect.objectContaining({
        status: "settled",
        purchaseId: PURCHASE_ID,
        settledPaymentReference: "0xsettled",
      }),
    );
    expect(row).toEqual(expect.objectContaining({ status: "settled" }));
  });

  it("releases the held grant reservation only when reconciliation confirms no settlement occurred", async () => {
    const { tx, setCalls } = queueTxUpdates(
      [reservation({ status: "released" })],
      [],
    );

    const row = await reconcilePendingPurchaseReservation({
      reservationId: RESERVATION_ID,
      outcome: "not_settled",
      note: "gateway confirmed no transfer",
    });

    expect(mocks.recordSettlement).not.toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalledTimes(2);
    expect(setCalls[0]).toEqual(
      expect.objectContaining({
        status: "released",
        failureReason:
          "reconciled_not_settled: gateway confirmed no transfer",
      }),
    );
    expect(row).toEqual(expect.objectContaining({ status: "released" }));
  });
});

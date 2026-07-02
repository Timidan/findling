import { describe, it, expect } from "vitest";
import { receiptMetadata } from "./receipt-metadata";
import type { ReceiptView } from "./receipt";

const view: ReceiptView = {
  receiptCode: "RCPT-1",
  publicSlug: "abc",
  momentTitle: "Golden hour over the bay",
  sourceType: "youtube",
  usageType: "social_clip",
  licenseSummary: null,
  attributionText: null,
  ownershipModel: null,
  network: "eip155:5042002",
  paymentReference: "0xref",
  provider: "gateway_x402",
  payerAddress: "0xpayer",
  grossMicroUsdc: 50000,
  creatorMicroUsdc: 40000,
  finderMicroUsdc: 6000,
  platformMicroUsdc: 4000,
  creatorHandle: "alice",
  finderHandle: null,
  settledAt: "2026-01-01T00:00:00.000Z",
};

describe("receiptMetadata", () => {
  it("titles the page with the moment and surfaces an OG title", () => {
    const m = receiptMetadata(view);
    expect(String(m.title)).toContain("Golden hour over the bay");
    expect(String(m.openGraph?.title)).toContain("Golden hour over the bay");
  });

  it("describes it as a USDC license (humanized usage type)", () => {
    const m = receiptMetadata(view);
    expect(String(m.description)).toContain("social clip");
  });

  it("falls back to a generic title when the receipt is missing", () => {
    const m = receiptMetadata(null);
    expect(String(m.title)).toBe("Receipt · Findling");
    expect(m.openGraph).toBeUndefined();
  });
});

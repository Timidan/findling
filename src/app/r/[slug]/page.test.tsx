import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getReceiptBySlug: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/server/receipt/receipt", () => ({
  getReceiptBySlug: mocks.getReceiptBySlug,
}));

vi.mock("@/server/receipt/receipt-metadata", () => ({
  receiptMetadata: vi.fn(() => ({ title: "Receipt" })),
}));

vi.mock("@/server/auth/current-user", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/components/site/site-header", () => ({
  SiteHeader: () => <header data-testid="site-header" />,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));

import ReceiptPage from "./page";

describe("ReceiptPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue(null);
    mocks.getReceiptBySlug.mockResolvedValue({
      receiptCode: "FND-TEST",
      publicSlug: "paid-clip",
      momentTitle: "Claimed PeerTube moment - 0170f0ae",
      sourceType: "upload",
      usageType: "video_embed",
      licenseSummary: "Standard Findling video embed license.",
      attributionText: "earliest_curation_before_run",
      ownershipModel: "channel_control",
      network: "arcTestnet",
      paymentReference: "b7738e10-5dfe-48f5-a1a1-ced42fcb8371",
      provider: "gateway_x402",
      payerAddress: "0x9e0511111111111111111111111111111111cc3f",
      grossMicroUsdc: 120_000,
      creatorMicroUsdc: 96_000,
      finderMicroUsdc: 14_400,
      platformMicroUsdc: 9_600,
      creatorHandle: "devcreator",
      finderHandle: "PeerTube Seed Finder",
      settledAt: "2026-06-24T03:29:00.000Z",
    });
  });

  it("links the payer address to Arc Testnet inside payment proof", async () => {
    const page = await ReceiptPage({
      params: Promise.resolve({ slug: "paid-clip" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Payment proof");
    expect(html).toContain(
      "https://testnet.arcscan.app/address/0x9e0511111111111111111111111111111111cc3f",
    );
    expect(html).toContain("View on Arc Testnet");
  });

  it("does not turn a Gateway settlement id into a fake transaction link", async () => {
    const page = await ReceiptPage({
      params: Promise.resolve({ slug: "paid-clip" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).not.toContain(
      "https://testnet.arcscan.app/tx/b7738e10-5dfe-48f5-a1a1-ced42fcb8371",
    );
  });

  it("links the settlement transaction when the reference is a tx hash", async () => {
    const hash = `0x${"a".repeat(64)}`;
    mocks.getReceiptBySlug.mockResolvedValueOnce({
      ...(await mocks.getReceiptBySlug()),
      paymentReference: hash,
    });

    const page = await ReceiptPage({
      params: Promise.resolve({ slug: "paid-clip" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain(`https://testnet.arcscan.app/tx/${hash}`);
    expect(html).toContain("View tx on Arc Testnet");
  });
});

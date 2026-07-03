import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMomentDetail: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/server/find/moment-detail", () => ({
  getMomentDetail: mocks.getMomentDetail,
}));

vi.mock("@/server/auth/current-user", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/components/site/site-header", () => ({
  SiteHeader: () => <header data-testid="site-header" />,
}));

vi.mock("@/components/find/license-checkout", () => ({
  LicenseCheckout: () => <aside data-testid="license-checkout" />,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));

import MomentPage from "./page";

describe("MomentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue(null);
    mocks.getMomentDetail.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Relationship advice",
      description: "A short clip with spoken audio.",
      creatorName: "creator",
      sourceType: "upload",
      previewUrl: "https://storage.example/preview.mp4",
      posterUrl: "https://storage.example/poster.jpg",
      priceMicroUsdc: 700_000,
      priceUsd: "0.700",
      usageType: "video_embed",
      licence: "Standard",
      durationMs: 12_000,
    });
  });

  it("renders the clip preview with controls and audible playback available", async () => {
    const page = await MomentPage({
      params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).toContain('controlsList="nodownload"');
    expect(html).not.toMatch(/\smuted(?:[=\s>])/);
  });
});

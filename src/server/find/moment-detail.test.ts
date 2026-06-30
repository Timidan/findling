import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLicensableMoment: vi.fn(),
  db: { select: vi.fn() },
  signOne: vi.fn(),
}));

vi.mock("@/server/catalog/licensable", () => ({
  findLicensableMoment: mocks.findLicensableMoment,
}));
vi.mock("@/server/db/client", () => ({ db: mocks.db }));
vi.mock("@/server/db/schema", () => ({ users: {} }));
vi.mock("@/server/storage/supabase-storage", () => ({
  supabaseStorage: { createSignedDownloadUrl: mocks.signOne },
}));

import { getMomentDetail } from "./moment-detail";

function licensable(over: Record<string, unknown> = {}) {
  return {
    moment: {
      id: "m1",
      title: "Snowboard — first-chair drop",
      description: "powder",
      creatorId: "u1",
      durationMs: 7000,
      priceMicroUsdc: 80000,
      priceUsdSnapshot: "0.08",
      usageType: "video_embed",
      licenseSummary: "CC BY",
      previewStorageKey: "preview/m1.mp4",
      clipStorageKey: "clip/m1.mp4",
      ...over,
    },
    asset: { sourceType: "upload", status: "ready" },
  };
}

beforeEach(() => {
  mocks.findLicensableMoment.mockReset();
  mocks.signOne.mockReset();
  mocks.db.select.mockReset();
  mocks.db.select.mockReturnValue({
    from: () => ({
      where: async () => [
        { username: "alice", displayName: null, walletAddress: null, email: "a@b.c" },
      ],
    }),
  });
  mocks.signOne.mockResolvedValue("https://signed/preview/m1.mp4");
});

describe("getMomentDetail", () => {
  it("returns null when the moment is not licensable", async () => {
    mocks.findLicensableMoment.mockResolvedValue(null);
    expect(await getMomentDetail("m1")).toBeNull();
  });

  it("returns null when there is no public preview key", async () => {
    mocks.findLicensableMoment.mockResolvedValue(licensable({ previewStorageKey: null }));
    expect(await getMomentDetail("m1")).toBeNull();
  });

  it("signs ONLY the preview key — never the clip key — and never leaks it", async () => {
    mocks.findLicensableMoment.mockResolvedValue(licensable());
    const d = await getMomentDetail("m1");

    expect(mocks.signOne).toHaveBeenCalledWith("preview/m1.mp4", expect.any(Number));
    expect(mocks.signOne).not.toHaveBeenCalledWith("clip/m1.mp4", expect.any(Number));
    expect(d).toMatchObject({
      id: "m1",
      title: "Snowboard — first-chair drop",
      creatorName: "alice",
      sourceType: "upload",
      priceMicroUsdc: 80000,
      priceUsd: "0.08",
      licence: "CC BY",
      posterUrl: "https://signed/preview/m1.mp4",
      previewUrl: "https://signed/preview/m1.mp4",
    });
    // The full clip key must never appear anywhere in the public DTO.
    expect(JSON.stringify(d)).not.toContain("clip/m1.mp4");
  });

  it("falls back to Standard licence label when summary is null", async () => {
    mocks.findLicensableMoment.mockResolvedValue(licensable({ licenseSummary: null }));
    const d = await getMomentDetail("m1");
    expect(d?.licence).toBe("Standard");
  });
});

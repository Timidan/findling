import { describe, it, expect } from "vitest";
import {
  assembleStudioMoments,
  type StudioCatalogRow,
  type StudioSaleAgg,
} from "./studio-assemble";

function row(over: Partial<StudioCatalogRow["moment"]> = {}): StudioCatalogRow {
  return {
    moment: {
      id: "m1",
      title: "Sunset",
      description: null,
      status: "published",
      usageType: "social_clip",
      durationMs: 5000,
      priceMicroUsdc: 50000,
      ownershipVerified: true,
      posterStorageKey: "moments/m1/poster.jpg",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      ...over,
    },
    asset: { sourceType: "upload" },
  };
}

describe("assembleStudioMoments", () => {
  it("applies the signed poster URL from the batch map", () => {
    const rows = [row()];
    const posters = new Map<string, string | null>([
      ["moments/m1/poster.jpg", "https://signed/m1"],
    ]);
    const { moments } = assembleStudioMoments(rows, new Map(), posters);
    expect(moments[0].posterUrl).toBe("https://signed/m1");
    expect(moments[0].sourceType).toBe("upload");
  });

  it("yields null posterUrl when the moment has no poster key (no lookup)", () => {
    const rows = [row({ posterStorageKey: null })];
    const { moments } = assembleStudioMoments(rows, new Map(), new Map());
    expect(moments[0].posterUrl).toBeNull();
  });

  it("yields null posterUrl when signing failed (key maps to null)", () => {
    const rows = [row()];
    const posters = new Map<string, string | null>([
      ["moments/m1/poster.jpg", null],
    ]);
    const { moments } = assembleStudioMoments(rows, new Map(), posters);
    expect(moments[0].posterUrl).toBeNull();
  });

  it("defaults licenses and earnings to zero when a moment has no sales", () => {
    const { moments } = assembleStudioMoments([row()], new Map(), new Map());
    expect(moments[0].licenses).toBe(0);
    expect(moments[0].earnedMicroUsdc).toBe(0);
  });

  it("applies sales and aggregates publishedCount + earned across rows", () => {
    const rows = [
      row({ id: "m1", status: "published" }),
      row({ id: "m2", status: "draft", posterStorageKey: null }),
    ];
    const sales = new Map<string, StudioSaleAgg>([
      ["m1", { licenses: 3, earned: 120000 }],
      ["m2", { licenses: 1, earned: 5000 }],
    ]);
    const out = assembleStudioMoments(rows, sales, new Map());
    expect(out.moments.find((m) => m.momentId === "m1")?.licenses).toBe(3);
    expect(out.publishedCount).toBe(1);
    expect(out.earnedMicroUsdc).toBe(125000);
  });
});

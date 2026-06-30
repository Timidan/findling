import { beforeEach, describe, expect, it, vi } from "vitest";

const EMBEDDING_DIMENSIONS = 384;

const mocks = vi.hoisted(() => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
  previewUrls: new Map<string, string | null>(),
  rows: [] as AvailableRow[],
  provider: {
    provider: "mock",
    model: "mock-hash",
    dimensions: 384,
    embed: vi.fn(),
  },
  listListings: vi.fn(),
  runAgentSearch: vi.fn(),
  lastQuery: null as QueryBuilder | null,
}));

vi.mock("../db/client", () => ({ db: mocks.db }));
vi.mock("@/server/db/client", () => ({ db: mocks.db }));
vi.mock("@/server/db/schema", () => ({
  assets: {},
  moments: {},
}));
vi.mock("../storage/supabase-storage", () => ({
  supabaseStorage: {
    createSignedDownloadUrls: vi.fn(async (keys: string[]) => {
      const out = new Map<string, string | null>();
      for (const key of keys) out.set(key, mocks.previewUrls.get(key) ?? null);
      return out;
    }),
  },
}));
vi.mock("../search", () => ({
  EMBEDDING_DIMENSIONS: 384,
  getEmbeddingProvider: vi.fn(() => mocks.provider),
}));
vi.mock("../claimable/listings", () => ({
  listListings: mocks.listListings,
}));
vi.mock("../agent/agent", () => ({
  runAgentSearch: mocks.runAgentSearch,
}));

import { supabaseStorage } from "../storage/supabase-storage";
import { getLicensableFeed, getUnifiedFeed } from "./feed";

interface QueryBuilder {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
}

type AvailableRow = {
  moment: {
    id: string;
    title: string;
    status: string;
    durationMs: number;
    priceMicroUsdc: number;
    usageType: string;
    licenseSummary: string | null;
    clipStorageKey: string | null;
    previewStorageKey: string | null;
    ownershipVerified: boolean;
    attestationAt: Date | null;
    createdAt: Date;
  };
  asset: {
    id: string;
    status: string;
    sourceType: string;
  };
  creator: {
    username: string | null;
    displayName: string | null;
    walletAddress: string | null;
    email: string | null;
  };
};

const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) =>
  i === 0 ? 1 : 0,
);

function makeQuery(rows: AvailableRow[]): QueryBuilder {
  const query = {
    from: vi.fn(() => query),
    innerJoin: vi.fn(() => query),
    where: vi.fn(() => query),
    orderBy: vi.fn(() => query),
    limit: vi.fn(async (limit: number) => rows.slice(0, limit)),
  };
  return query;
}

function queueRows(rows: AvailableRow[]) {
  mocks.rows = rows;
  const query = makeQuery(rows);
  mocks.lastQuery = query;
  mocks.db.select.mockReturnValueOnce(query);
}

function signRows(rows: AvailableRow[]) {
  for (const row of rows) {
    if (row.moment.previewStorageKey) {
      mocks.previewUrls.set(
        row.moment.previewStorageKey,
        `https://preview.example/${row.moment.previewStorageKey}`,
      );
    }
  }
}

function availableRow(
  id: string,
  overrides: Partial<AvailableRow["moment"]> & {
    asset?: Partial<AvailableRow["asset"]>;
    creator?: Partial<AvailableRow["creator"]>;
  } = {},
): AvailableRow {
  return {
    moment: {
      id,
      title: `Moment ${id}`,
      status: "published",
      durationMs: 12_000,
      priceMicroUsdc: 250_000,
      usageType: "video_embed",
      licenseSummary: "CC BY",
      clipStorageKey: `full-clips/${id}.mp4`,
      previewStorageKey: `previews/${id}.mp4`,
      ownershipVerified: true,
      attestationAt: new Date("2026-06-24T10:00:00.000Z"),
      createdAt: new Date("2026-06-24T10:00:00.000Z"),
      ...overrides,
    },
    asset: {
      id: `asset-${id}`,
      status: "published",
      sourceType: "upload",
      ...overrides.asset,
    },
    creator: {
      username: "creator",
      displayName: "Creator Name",
      walletAddress: "0x1111111111111111111111111111111111111111",
      email: "creator@example.com",
      ...overrides.creator,
    },
  };
}

const wantedListings = [
  {
    id: "wanted-1",
    title: "Last-second buzzer-beater three",
    externalIdentity: "hoops_daily",
    externalIdentityKind: "peertube_channel" as const,
    sourceLicenceLabel: "CC BY-SA",
    pledgedDemandMicroUsdc: 420_000,
    pledgeCount: 6,
    status: "open" as const,
  },
  {
    id: "wanted-2",
    title: "Clean ace clutch reaction",
    externalIdentity: "karate_kombat",
    externalIdentityKind: "peertube_channel" as const,
    sourceLicenceLabel: "CC BY",
    pledgedDemandMicroUsdc: 310_000,
    pledgeCount: 4,
    status: "open" as const,
  },
  {
    id: "wanted-3",
    title: "Slow espresso pour",
    externalIdentity: "cafe_craft",
    externalIdentityKind: "peertube_channel" as const,
    sourceLicenceLabel: "CC0",
    pledgedDemandMicroUsdc: 64_000,
    pledgeCount: 2,
    status: "claimed" as const,
  },
];

describe("getLicensableFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.previewUrls.clear();
    mocks.provider.embed.mockResolvedValue([vector]);
    mocks.listListings.mockResolvedValue({ listings: wantedListings });
  });

  it("excludes drafts, takedowns, and rows without a playable preview", async () => {
    const rows = [
      availableRow("ok"),
      availableRow("draft", { status: "draft" }),
      availableRow("takedown", { asset: { status: "takedown_pending" } }),
      availableRow("no-preview", { previewStorageKey: null }),
    ];
    signRows(rows);
    queueRows(rows);

    const items = await getLicensableFeed({ limit: 10 });

    expect(items).toEqual([
      {
        kind: "available",
        id: "ok",
        title: "Moment ok",
        who: "creator @ upload",
        durationMs: 12_000,
        priceMicroUsdc: 250_000,
        licence: "CC BY",
        posterUrl: "https://preview.example/previews/ok.mp4",
        previewUrl: "https://preview.example/previews/ok.mp4",
      },
    ]);
  });

  it("embeds a non-empty query and preserves cosine-ranked row order", async () => {
    const rows = [
      availableRow("closer", { title: "Closer semantic hit" }),
      availableRow("farther", { title: "Farther semantic hit" }),
    ];
    signRows(rows);
    queueRows(rows);

    const items = await getLicensableFeed({ query: "arena celebration", limit: 10 });

    expect(mocks.provider.embed).toHaveBeenCalledWith(["arena celebration"]);
    expect(mocks.lastQuery?.orderBy).toHaveBeenCalledTimes(1);
    expect(items.map((item) => item.id)).toEqual(["closer", "farther"]);
  });

  it("uses recency without embedding when the query is empty", async () => {
    const rows = [
      availableRow("new", { createdAt: new Date("2026-06-24T12:00:00.000Z") }),
      availableRow("old", { createdAt: new Date("2026-06-24T09:00:00.000Z") }),
    ];
    signRows(rows);
    queueRows(rows);

    const items = await getLicensableFeed({ query: "  ", limit: 10 });

    expect(mocks.provider.embed).not.toHaveBeenCalled();
    expect(items.map((item) => item.id)).toEqual(["new", "old"]);
  });

  it.each([
    ["usageType", { usageType: "newsletter" }, "usage"],
    ["licence", { licence: "standard" }, "licence"],
    ["source", { source: "youtube" }, "source"],
    ["minDurationMs", { minDurationMs: 20_000 }, "duration"],
    ["maxDurationMs", { maxDurationMs: 10_000 }, "short"],
    ["maxPriceMicroUsdc", { maxPriceMicroUsdc: 100_000 }, "cheap"],
  ] as const)("narrows by %s", async (_name, filters, expectedId) => {
    const rows = [
      availableRow("usage", { usageType: "newsletter" }),
      availableRow("licence", { licenseSummary: null }),
      availableRow("source", { asset: { sourceType: "youtube" } }),
      availableRow("duration", { durationMs: 25_000 }),
      availableRow("short", { durationMs: 8_000 }),
      availableRow("cheap", { priceMicroUsdc: 75_000 }),
    ];
    signRows(rows);
    queueRows(rows);

    const items = await getLicensableFeed({ filters, limit: 10 });

    expect(items.map((item) => item.id)).toEqual([expectedId]);
  });
});

describe("getUnifiedFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.previewUrls.clear();
    mocks.provider.embed.mockResolvedValue([vector]);
    mocks.listListings.mockResolvedValue({ listings: wantedListings });
  });

  it("returns pure available and wanted tabs", async () => {
    const rows = [availableRow("available-1")];
    signRows(rows);
    queueRows(rows);

    await expect(getUnifiedFeed({ tab: "available", limit: 10 })).resolves.toEqual({
      items: [
        expect.objectContaining({
          kind: "available",
          id: "available-1",
        }),
      ],
    });

    await expect(getUnifiedFeed({ tab: "wanted", limit: 10 })).resolves.toEqual({
      items: wantedListings.map((listing) => ({
        kind: "wanted",
        listingId: listing.id,
        title: listing.title,
        externalIdentity: listing.externalIdentity,
        sourceLicenceLabel: listing.sourceLicenceLabel,
        pledgedDemandMicroUsdc: listing.pledgedDemandMicroUsdc,
        pledgeCount: listing.pledgeCount,
      })),
    });
  });

  it("merges All demand-first with Wanted weighted ahead of Available", async () => {
    const rows = [availableRow("available-1"), availableRow("available-2")];
    signRows(rows);
    queueRows(rows);

    const result = await getUnifiedFeed({ tab: "all", limit: 5 });

    expect(result.items.map((item) => item.kind)).toEqual([
      "wanted",
      "wanted",
      "available",
      "wanted",
      "available",
    ]);
    expect(result.items.map((item) => ("listingId" in item ? item.listingId : item.id))).toEqual([
      "wanted-1",
      "wanted-2",
      "available-1",
      "wanted-3",
      "available-2",
    ]);
  });

  it("searches Wanted lexically by title and external identity", async () => {
    await expect(
      getUnifiedFeed({ tab: "wanted", query: "KARATE", limit: 10 }),
    ).resolves.toEqual({
      items: [
        {
          kind: "wanted",
          listingId: "wanted-2",
          title: "Clean ace clutch reaction",
          externalIdentity: "karate_kombat",
          sourceLicenceLabel: "CC BY",
          pledgedDemandMicroUsdc: 310_000,
          pledgeCount: 4,
        },
      ],
    });

    expect(mocks.provider.embed).not.toHaveBeenCalled();
  });

  it("does not leak full clip keys, secrets, grants, or write agent runs", async () => {
    const rows = [availableRow("safe")];
    signRows(rows);
    queueRows(rows);

    const result = await getUnifiedFeed({ tab: "all", limit: 10 });
    const json = JSON.stringify(result);

    expect(json).not.toContain("clipStorageKey");
    expect(json).not.toContain("full-clips");
    expect(json).not.toContain("secret");
    expect(json).not.toContain("grant");
    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.runAgentSearch).not.toHaveBeenCalled();
    expect(supabaseStorage.createSignedDownloadUrls).toHaveBeenCalledWith(
      ["previews/safe.mp4"],
      expect.any(Number),
    );
  });
});

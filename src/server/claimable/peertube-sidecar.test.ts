import { describe, expect, it, vi } from "vitest";
import { ListingConflictError, type CreateListingInput } from "./listings";
import { seedFromPeerTube, thumbnailUrlForVideo } from "./peertube-sidecar";

vi.mock("../db/client", () => ({ db: {} }));

describe("thumbnailUrlForVideo", () => {
  const inst = "https://peertube.example";
  it("resolves an instance-relative thumbnail path to an absolute https URL", () => {
    expect(
      thumbnailUrlForVideo({ thumbnailPath: "/lazy-static/thumbnails/abc.jpg" }, inst),
    ).toBe("https://peertube.example/lazy-static/thumbnails/abc.jpg");
  });
  it("falls back to previewPath when thumbnailPath is absent", () => {
    expect(thumbnailUrlForVideo({ previewPath: "/lazy-static/previews/x.png" }, inst)).toBe(
      "https://peertube.example/lazy-static/previews/x.png",
    );
  });
  it("rejects a protocol-relative path (off-host)", () => {
    expect(thumbnailUrlForVideo({ thumbnailPath: "//evil.example/x.jpg" }, inst)).toBeNull();
  });
  it("rejects an absolute off-origin URL", () => {
    expect(
      thumbnailUrlForVideo({ thumbnailPath: "https://evil.example/x.jpg" }, inst),
    ).toBeNull();
  });
  it("rejects when the instance is not https", () => {
    expect(
      thumbnailUrlForVideo({ thumbnailPath: "/t.jpg" }, "http://peertube.example"),
    ).toBeNull();
  });
  it("returns null when there is no thumbnail at all", () => {
    expect(thumbnailUrlForVideo({}, inst)).toBeNull();
  });
});

const SEED_FINDER_ID = "11111111-1111-4111-8111-111111111111";

function video(overrides: Record<string, unknown>) {
  return {
    uuid: "video-default",
    name: "Default video",
    licence: { id: 1, label: "Attribution" },
    channel: {
      name: "default_channel",
      host: "origin.example",
      url: "https://origin.example/video-channels/default_channel",
      actorId: "https://origin.example/video-channels/default_channel",
    },
    ...overrides,
  };
}

function page(data: unknown[], total = 6) {
  return new Response(JSON.stringify({ total, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("seedFromPeerTube", () => {
  it("refuses localhost and private-IP instances before fetch", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch should not run for blocked PeerTube instances");
    });

    await expect(
      seedFromPeerTube({
        instance: "https://localhost",
        seedFinderId: SEED_FINDER_ID,
        maxPages: 1,
        fetchImpl,
        lookup: vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]),
      }),
    ).rejects.toThrow(/blocked|localhost|private/i);

    await expect(
      seedFromPeerTube({
        instance: "https://private.example",
        seedFinderId: SEED_FINDER_ID,
        maxPages: 1,
        fetchImpl,
        lookup: vi.fn(async () => [{ address: "10.0.0.5", family: 4 }]),
      }),
    ).rejects.toThrow(/blocked|private/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("filters licences, dedupes federated videos, maps CC metadata, and skips listing conflicts", async () => {
    const pages = new Map<number, Response>([
      [
        0,
        page([
          video({
            uuid: "goal-uuid",
            name: "  Last-second goal  ",
            licence: { id: 1, label: "Attribution" },
            channel: {
              name: "sports",
              host: "origin.example",
              url: "https://origin.example/video-channels/sports",
              actorId: "https://origin.example/video-channels/sports",
            },
          }),
          video({
            uuid: "city-uuid",
            name: "Creative commons city timelapse",
            licence: { id: 2, label: "Attribution - Share Alike" },
            channel: {
              name: "city_lab",
              host: "origin.example",
              url: "https://origin.example/video-channels/city_lab",
              actorId: "https://origin.example/video-channels/city_lab",
            },
          }),
          video({
            uuid: "nc-uuid",
            name: "Non-commercial lecture",
            licence: { id: 4, label: "Attribution - Non Commercial" },
            channel: {
              name: "lectures",
              host: "origin.example",
              url: "https://origin.example/video-channels/lectures",
              actorId: "https://origin.example/video-channels/lectures",
            },
          }),
        ]),
      ],
      [
        3,
        page([
          video({
            uuid: "archive-uuid",
            name: "Public-domain archive reel",
            licence: { id: 7, label: "Public Domain Dedication" },
            channel: {
              name: "archive",
              host: "origin.example",
              url: "https://origin.example/video-channels/archive",
              actorId: "https://origin.example/video-channels/archive",
            },
          }),
          video({
            uuid: "nd-uuid",
            name: "No-derivatives rally clip",
            licence: { id: 3, label: "Attribution - No Derivatives" },
            channel: {
              name: "rallies",
              host: "origin.example",
              url: "https://origin.example/video-channels/rallies",
              actorId: "https://origin.example/video-channels/rallies",
            },
          }),
          video({
            uuid: "goal-uuid",
            name: "Federated duplicate of the goal",
            licence: { id: 1, label: "Attribution" },
            channel: {
              name: "sports",
              host: "mirror.example",
              url: "https://mirror.example/video-channels/sports",
              actorId: "https://origin.example/video-channels/sports",
            },
          }),
        ]),
      ],
    ]);
    const fetched: string[] = [];
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(input.toString());
      fetched.push(url.toString());
      const response = pages.get(Number(url.searchParams.get("start")));
      if (!response) throw new Error(`unexpected page ${url.toString()}`);
      return response;
    });
    const createInputs: CreateListingInput[] = [];
    const create = vi.fn(async (_finderId: string, input: CreateListingInput) => {
      createInputs.push(input);
      if (input.title === "Creative commons city timelapse") {
        throw new ListingConflictError("duplicate_live_external_ref");
      }
      return {
        listing: { id: `listing-${createInputs.length}` },
        claimSecret: "not-used",
      };
    });

    const result = await seedFromPeerTube({
      instance: "https://peertube.example",
      seedFinderId: SEED_FINDER_ID,
      maxPages: 2,
      pageSize: 3,
      fetchImpl,
      lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
      create,
    });

    expect(fetched).toEqual([
      "https://peertube.example/api/v1/videos?count=3&start=0",
      "https://peertube.example/api/v1/videos?count=3&start=3",
    ]);
    expect(result).toEqual({
      pagesFetched: 2,
      videosSeen: 6,
      kept: 3,
      excludedByLicence: 2,
      duplicatesSkipped: 1,
      invalidSkipped: 0,
      created: 2,
      conflictSkipped: 1,
    });
    expect(create).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenCalledWith(SEED_FINDER_ID, {
      externalIdentity: "sports · origin.example",
      externalIdentityKind: "peertube_channel",
      externalRef: "https://origin.example/video-channels/sports",
      title: "Last-second goal",
      sourceLicenceLabel: "CC BY",
      sourceThumbnailUrl: null,
    });
    expect(createInputs.map((input) => input.sourceLicenceLabel)).toEqual([
      "CC BY",
      "CC BY-SA",
      "CC0",
    ]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimVerificationTokenForListing,
  verifyPeerTubeActorProof,
} from "./peertube-proof";

const LISTING_ID = "33333333-3333-4333-8333-333333333333";
const TEST_AUTH_SECRET =
  "test-auth-session-secret-with-at-least-thirty-two-characters";

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: LISTING_ID,
    externalIdentityKind: "peertube_channel",
    externalRef: "https://example.video/video-channels/creator",
    ...overrides,
  } as never;
}

describe("PeerTube actor-control proof verifier", () => {
  const originalSecret = process.env.AUTH_SESSION_SECRET;

  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = TEST_AUTH_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.AUTH_SESSION_SECRET;
    } else {
      process.env.AUTH_SESSION_SECRET = originalSecret;
    }
  });

  it("derives a deterministic unguessable token from the listing id and auth secret", () => {
    const token = claimVerificationTokenForListing(LISTING_ID);

    expect(token).toMatch(/^fdl-claim-v1-[A-Za-z0-9_-]{43}$/);
    expect(claimVerificationTokenForListing(LISTING_ID)).toBe(token);

    process.env.AUTH_SESSION_SECRET =
      "different-test-auth-session-secret-with-at-least-thirty-two-characters";
    expect(claimVerificationTokenForListing(LISTING_ID)).not.toBe(token);
  });

  it("verifies when the expected token appears in the public actor summary", async () => {
    const token = claimVerificationTokenForListing(LISTING_ID);
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ summary: `Findling verification ${token}` }), {
        status: 200,
        headers: { "content-type": "application/activity+json" },
      }),
    );
    const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);

    const result = await verifyPeerTubeActorProof(
      listing(),
      { type: "peertube_actor_token", token },
      {
        fetch,
        lookup,
        now: () => new Date("2026-06-24T10:01:00.000Z"),
      },
    );

    expect(result).toMatchObject({
      verified: true,
      snapshot: {
        kind: "peertube_actor_token",
        verifier: "findling-peertube-proof-v1",
        proofUrl: "https://example.video/video-channels/creator",
        matchedField: "actor.summary",
        verifiedAt: "2026-06-24T10:01:00.000Z",
      },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("verifies when the expected token appears in a public video support field", async () => {
    const token = claimVerificationTokenForListing(LISTING_ID);
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          support: `Tips and Findling ${token}`,
          channel: { url: "https://example.video/video-channels/creator" },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const result = await verifyPeerTubeActorProof(
      listing(),
      {
        type: "peertube_actor_token",
        token,
        proofUrl: "https://example.video/videos/watch/abc",
      },
      {
        fetch,
        lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
        now: () => new Date("2026-06-24T10:02:00.000Z"),
      },
    );

    expect(result).toMatchObject({
      verified: true,
      snapshot: {
        proofUrl: "https://example.video/videos/watch/abc",
        matchedField: "video.support",
      },
    });
  });

  it("rejects wrong tokens before fetching public proof material", async () => {
    const fetch = vi.fn();
    const result = await verifyPeerTubeActorProof(
      listing(),
      { type: "peertube_actor_token", token: "wrong-token" },
      {
        fetch,
        lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
      },
    );

    expect(result.verified).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses localhost and private-IP proof URLs before fetch", async () => {
    const token = claimVerificationTokenForListing(LISTING_ID);
    const fetch = vi.fn();

    const localhost = await verifyPeerTubeActorProof(
      listing({ externalRef: "https://localhost/video-channels/creator" }),
      { type: "peertube_actor_token", token },
      {
        fetch,
        lookup: vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]),
      },
    );
    const privateIp = await verifyPeerTubeActorProof(
      listing({ externalRef: "https://private.example/video-channels/creator" }),
      { type: "peertube_actor_token", token },
      {
        fetch,
        lookup: vi.fn(async () => [{ address: "10.0.0.5", family: 4 }]),
      },
    );

    expect(localhost.verified).toBe(false);
    expect(privateIp.verified).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

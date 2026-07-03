import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  isSameOrigin: vi.fn(),
  issueYoutubeOAuthState: vi.fn(() => "signed-state"),
  buildAuthUrl: vi.fn(() => "https://accounts.google.com/o/oauth2/v2/auth?state=signed-state"),
  select: vi.fn(),
}));

vi.mock("@/server/auth/current-user", () => ({
  requireUserId: mocks.requireUserId,
}));

vi.mock("@/server/auth/csrf", () => ({
  isSameOrigin: mocks.isSameOrigin,
}));

vi.mock("@/server/youtube/oauth", () => ({
  buildAuthUrl: mocks.buildAuthUrl,
  issueYoutubeOAuthState: mocks.issueYoutubeOAuthState,
  YOUTUBE_OAUTH_STATE_COOKIE: "findling_youtube_oauth_state",
  YOUTUBE_OAUTH_STATE_MAX_AGE_SECONDS: 600,
}));

vi.mock("@/server/db/client", () => ({
  db: { select: mocks.select },
}));

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

function mockConnectedYoutubeUser() {
  mocks.select.mockReturnValueOnce({
    from: () => ({
      where: async () => [
        {
          youtubeRefreshTokenCiphertext: "ciphertext",
          youtubeChannelTitle: "Creator Channel",
        },
      ],
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isSameOrigin.mockReturnValue(true);
  mocks.requireUserId.mockRejectedValue(new Error("signed out"));
  mocks.select.mockReturnValue({
    from: () => ({
      where: async () => [],
    }),
  });
});

afterEach(() => {
  if (originalAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
});

describe("GET /api/creator/youtube/connect", () => {
  it("redirects signed-out browser navigations to the public settings page", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://findling.timidan.xyz/";

    const response = await GET(
      new NextRequest("http://localhost:3000/api/creator/youtube/connect", {
        headers: {
          host: "localhost:3000",
        },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://findling.timidan.xyz/studio/settings",
    );
  });

  it("redirects already-connected creators to the YouTube import page without starting OAuth", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://findling.timidan.xyz/";
    mocks.requireUserId.mockResolvedValueOnce("user-1");
    mockConnectedYoutubeUser();

    const response = await GET(
      new NextRequest("https://findling.timidan.xyz/api/creator/youtube/connect"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://findling.timidan.xyz/studio/youtube?youtube=already_connected",
    );
    expect(mocks.buildAuthUrl).not.toHaveBeenCalled();
    expect(mocks.issueYoutubeOAuthState).not.toHaveBeenCalled();
  });
});

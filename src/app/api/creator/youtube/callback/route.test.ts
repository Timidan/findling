import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  verifyYoutubeOAuthState: vi.fn(),
  getMyChannel: vi.fn(),
  encrypt: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/server/youtube/oauth", () => ({
  exchangeCode: mocks.exchangeCode,
  verifyYoutubeOAuthState: mocks.verifyYoutubeOAuthState,
  YOUTUBE_OAUTH_STATE_COOKIE: "findling_youtube_oauth_state",
}));

vi.mock("@/server/youtube/api", () => ({
  getMyChannel: mocks.getMyChannel,
}));

vi.mock("@/server/crypto/token-crypto", () => ({
  tokenCipher: () => ({ encrypt: mocks.encrypt }),
}));

vi.mock("@/server/db/client", () => ({
  db: { update: mocks.update },
}));

describe("GET /api/creator/youtube/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://findling.timidan.xyz/";
    mocks.verifyYoutubeOAuthState.mockReturnValue({ userId: "user-1" });
    mocks.exchangeCode.mockResolvedValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
    });
    mocks.getMyChannel.mockResolvedValue({
      channelId: "channel-1",
      title: "Creator Channel",
      uploadsPlaylistId: "uploads-1",
    });
    mocks.encrypt.mockReturnValue("encrypted-refresh");
    mocks.where.mockResolvedValue(undefined);
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.update.mockReturnValue({ set: mocks.set });
  });

  it("sends successful YouTube connections back to the Studio import page", async () => {
    const response = await GET(
      new NextRequest(
        "https://findling.timidan.xyz/api/creator/youtube/callback?code=abc&state=signed-state",
        {
          headers: {
            cookie: "findling_youtube_oauth_state=signed-state",
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://findling.timidan.xyz/studio/youtube?youtube=connected",
    );
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        youtubeChannelId: "channel-1",
        youtubeChannelTitle: "Creator Channel",
        youtubeRefreshTokenCiphertext: "encrypted-refresh",
      }),
    );
  });
});

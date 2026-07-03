import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/current-user", () => ({
  requireUserId: vi.fn(async () => {
    throw new Error("signed out");
  }),
}));

vi.mock("@/server/auth/csrf", () => ({
  isSameOrigin: vi.fn(() => true),
}));

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

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
});

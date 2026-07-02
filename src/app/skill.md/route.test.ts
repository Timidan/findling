import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
});

describe("GET /skill.md", () => {
  it("uses the configured public app URL in agent examples", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://findling.timidan.xyz/";

    const response = await GET(
      new NextRequest("http://localhost:3000/skill.md", {
        headers: {
          host: "localhost:3000",
        },
      }),
    );

    const markdown = await response.text();
    expect(markdown).toContain("Base URL: `https://findling.timidan.xyz`");
    expect(markdown).toContain("https://findling.timidan.xyz/api/auth/nonce");
    expect(markdown).not.toContain("https://localhost:3000");
  });
});

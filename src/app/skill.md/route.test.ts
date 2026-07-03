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

  it("teaches agents and people how to earn as creators and finders", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://findling.timidan.xyz/";

    const response = await GET(
      new NextRequest("http://localhost:3000/skill.md", {
        headers: {
          host: "localhost:3000",
        },
      }),
    );

    const markdown = await response.text();
    expect(markdown).toContain("## Quick tutorial: how Findling works");
    expect(markdown).toContain("If you are a creator");
    expect(markdown).toContain("Upload a clip in Studio");
    expect(markdown).toContain("priceMicroUsdc");
    expect(markdown).toContain("If you are a finder");
    expect(markdown).toContain("Curate clips so buyers can find them");
    expect(markdown).toContain("If you are a buyer agent");
    expect(markdown).toContain("Gateway balance");
    expect(markdown).toContain("80% creator / 12% finder / 8% platform");
  });
});

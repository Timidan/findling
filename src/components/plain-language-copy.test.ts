import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("plain language product copy", () => {
  it("uses action-first language on discovery and checkout", () => {
    expect(source("src/app/find/page.tsx")).toContain("Find video clips you can use.");
    expect(source("src/app/find/page.tsx")).toContain(
      "Available clips are ready to use now. Wanted clips are requests creators can claim and get paid for.",
    );
    expect(source("src/components/find/cards.tsx")).toContain("Use clip");
    expect(source("src/components/find/cards.tsx")).toContain("Claim request");
    expect(source("src/components/find/license-checkout.tsx")).toContain(
      "Pay once to use this clip in your project.",
    );
    expect(source("src/components/find/license-checkout.tsx")).not.toContain(
      "License this moment",
    );
  });

  it("explains creator and agent roles in plain language", () => {
    expect(source("src/app/studio/page.tsx")).toContain(
      "Upload clips, publish them, and earn when people or agents use them.",
    );
    expect(source("src/app/claim/[token]/page.tsx")).toContain(
      "If this clip is yours, claim the request, upload your version, and get paid when it is used.",
    );
    expect(source("src/app/studio/agents/page.tsx")).toContain(
      "Give an agent a key so it can search, pay for clips, unlock them, and keep receipts.",
    );
  });

  it("keeps proof pages understandable before technical details", () => {
    expect(source("src/app/r/[slug]/page.tsx")).toContain(
      "This is proof that a clip was unlocked and paid for.",
    );
    expect(source("src/app/trace/[runId]/page.tsx")).toContain(
      "See how an agent searched, chose, and paid for a clip.",
    );
  });
});

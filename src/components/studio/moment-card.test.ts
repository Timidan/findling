import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Studio YouTube import entry points", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/studio/moment-card.tsx"),
    "utf8",
  );

  it("routes Studio import CTAs to the import hub instead of restarting OAuth", () => {
    expect(source).toContain('href="/studio/youtube"');
    expect(source).not.toContain('href="/api/creator/youtube/connect"');
  });
});

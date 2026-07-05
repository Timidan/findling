import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("feed cards", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/find/cards.tsx"),
    "utf8",
  );

  it("shows PeerTube source and paid-count badges when available", () => {
    expect(source).toContain("PeerTubeBadge");
    expect(source).toContain('item.sourceType === "peertube"');
    expect(source).toContain("item.licenses > 0");
    expect(source).toContain("paid");
  });
});

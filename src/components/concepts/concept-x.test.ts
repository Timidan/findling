import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("LandingX scroll story responsiveness", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/concepts/concept-x.tsx"),
    "utf8",
  );

  it("keeps the pinned scroll story active below desktop widths", () => {
    expect(source).toContain('mm.add("(min-width: 0px)"');
    expect(source).not.toContain('mm.add("(min-width: 1024px)"');
    expect(source).not.toContain('className="moment-story relative hidden lg:block"');
    expect(source).not.toContain("mobile-moment-story");
  });

  it("lets people pause the background video with a button or keyboard shortcut", () => {
    expect(source).toContain("useBackgroundVideoPause");
    expect(source).toContain('aria-label={videoPaused ? "Play background video" : "Pause background video"}');
    expect(source).toContain('event.key.toLowerCase() === "p"');
    expect(source).toContain("data-bg-video");
  });
});

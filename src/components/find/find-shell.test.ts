import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FindShell tabs", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/find/find-shell.tsx"),
    "utf8",
  );

  it("labels the wanted demand pipeline as Requests", () => {
    expect(source).toContain('{ k: "wanted", label: "Requests" }');
    expect(source).toContain("Requests are clips people want.");
    expect(source).toContain("[scrollbar-width:none]");
    expect(source).toContain("hidden shrink-0 items-center gap-1 sm:flex");
    expect(source).not.toContain('{ k: "wanted", label: "Wanted" }');
  });
});

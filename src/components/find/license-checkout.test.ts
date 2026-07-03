import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("LicenseCheckout auth state", () => {
  it("remounts checkout when refreshed server auth changes", () => {
    const page = source("src/app/m/[id]/page.tsx");

    expect(page).toContain("<LicenseCheckout");
    expect(page).toContain('key={initialUser?.id ?? initialUser?.address ?? "signed-out"}');
  });
});

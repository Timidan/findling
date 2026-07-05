import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("SiteHeader navigation", () => {
  const headerSource = readFileSync(
    join(process.cwd(), "src/components/site/site-header.tsx"),
    "utf8",
  );
  const studioLayoutSource = readFileSync(
    join(process.cwd(), "src/app/studio/layout.tsx"),
    "utf8",
  );

  it("keeps the global header focused on Studio, Requests, and signed-out agent onboarding", () => {
    expect(headerSource).toContain('{ href: "/studio", label: "Studio" }');
    expect(headerSource).toContain('{ href: "/wanted", label: "Requests" }');
    expect(headerSource).toContain('{ href: "/agents", label: "For agents", signedOutOnly: true }');
    expect(headerSource).toContain("item.signedOutOnly && me !== null");
    expect(headerSource).not.toContain('{ href: "/find", label: "Find" }');
    expect(headerSource).not.toContain('{ href: "/studio/earnings", label: "Earnings" }');
  });

  it("mounts the shared header inside Studio pages", () => {
    expect(studioLayoutSource).toContain("import { SiteHeader }");
    expect(studioLayoutSource).toContain('<SiteHeader active="/studio" initialUser={sessionUser} />');
  });
});

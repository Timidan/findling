import { describe, it, expect } from "vitest";
import { canViewTrace } from "./trace-access";

const OWNER = "buyer-1";
const OTHER = "buyer-2";

describe("canViewTrace", () => {
  it("shows an ownerless (null buyerId) demo run to an anonymous viewer", () => {
    expect(canViewTrace(null, null)).toBe(true);
  });

  it("shows an ownerless demo run to any logged-in viewer", () => {
    expect(canViewTrace(null, OTHER)).toBe(true);
  });

  it("shows a private run to its owner", () => {
    expect(canViewTrace(OWNER, OWNER)).toBe(true);
  });

  it("hides a private run from a different logged-in viewer", () => {
    expect(canViewTrace(OWNER, OTHER)).toBe(false);
  });

  it("hides a private run from an anonymous viewer", () => {
    expect(canViewTrace(OWNER, null)).toBe(false);
  });
});

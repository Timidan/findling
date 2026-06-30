import { describe, it, expect } from "vitest";
import { checkPublishable, type PublishableMoment } from "./publishable";

const OWNER = "user-1";
const base: PublishableMoment = {
  creatorId: OWNER,
  status: "draft",
  clipStorageKey: "moments/clip.mp4",
  ownershipVerified: true,
  attestationAt: new Date("2026-01-01T00:00:00Z"),
};

describe("checkPublishable", () => {
  it("allows publishing an owned, attested draft with a clip", () => {
    expect(checkPublishable(base, OWNER)).toEqual({ ok: true });
  });

  it("rejects a missing moment", () => {
    expect(checkPublishable(null, OWNER)).toEqual({ ok: false, reason: "moment_not_found" });
  });

  it("rejects a non-owner (no cross-account publish)", () => {
    expect(checkPublishable(base, "someone-else")).toEqual({ ok: false, reason: "not_owner" });
  });

  it("rejects an already-published moment", () => {
    expect(checkPublishable({ ...base, status: "published" }, OWNER)).toEqual({
      ok: false,
      reason: "already_published",
    });
  });

  it("rejects publishing from a non-draft status", () => {
    expect(checkPublishable({ ...base, status: "takedown" }, OWNER)).toEqual({
      ok: false,
      reason: "not_publishable_from_takedown",
    });
  });

  it("rejects when the clip is not ready", () => {
    expect(checkPublishable({ ...base, clipStorageKey: null }, OWNER)).toEqual({
      ok: false,
      reason: "clip_not_ready",
    });
  });

  it("rejects when ownership is not attested", () => {
    expect(checkPublishable({ ...base, ownershipVerified: false }, OWNER)).toEqual({
      ok: false,
      reason: "ownership_not_attested",
    });
    expect(checkPublishable({ ...base, attestationAt: null }, OWNER)).toEqual({
      ok: false,
      reason: "ownership_not_attested",
    });
  });
});

/**
 * Pure publish-eligibility logic for moments (no I/O, no DB) so it's unit-testable
 * in isolation. The DB-backed `publishMoment` in catalog.ts applies this check.
 */

/** The moment fields publish eligibility depends on. */
export interface PublishableMoment {
  creatorId: string;
  status: string;
  clipStorageKey: string | null;
  previewStorageKey: string | null;
  ownershipVerified: boolean;
  attestationAt: Date | null;
}

export type Publishability = { ok: true } | { ok: false; reason: string };

/**
 * A moment is publishable (draft → published) only when the caller owns it, it's
 * a draft, its clip + preview exist, and ownership is attested — the same bar
 * discovery needs before showing a paid clip.
 */
export function checkPublishable(
  moment: PublishableMoment | null | undefined,
  creatorId: string,
): Publishability {
  if (!moment) return { ok: false, reason: "moment_not_found" };
  if (moment.creatorId !== creatorId) return { ok: false, reason: "not_owner" };
  if (moment.status === "published") return { ok: false, reason: "already_published" };
  if (moment.status !== "draft") {
    return { ok: false, reason: `not_publishable_from_${moment.status}` };
  }
  if (!moment.clipStorageKey) return { ok: false, reason: "clip_not_ready" };
  if (!moment.previewStorageKey) return { ok: false, reason: "preview_not_ready" };
  if (!moment.ownershipVerified || !moment.attestationAt) {
    return { ok: false, reason: "ownership_not_attested" };
  }
  return { ok: true };
}

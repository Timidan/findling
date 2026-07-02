/**
 * Hard concurrency cap for heavy clip processing (yt-dlp + ffmpeg) on the single
 * droplet VPS. Without this, N concurrent imports spawn N subprocess trees on one
 * box (~80MB + a CPU core each) and all time out together under memory/CPU
 * pressure — a cascading failure (AUDIT B4). In-process (one persistent Node
 * server); the per-route rate limit smooths bursts, this is the absolute ceiling.
 *
 * Fail-fast, not queued: if capacity is full, throws so the route returns 503 +
 * Retry-After immediately rather than letting requests pile up past their budget.
 */
const MAX_GLOBAL = Math.max(1, Number(process.env.CLIP_MAX_CONCURRENCY ?? 2));
const MAX_PER_USER = Math.max(1, Number(process.env.CLIP_MAX_PER_USER ?? 1));

let active = 0;
const perUser = new Map<string, number>();

export class ClipCapacityError extends Error {
  constructor() {
    super("clip_capacity");
    this.name = "ClipCapacityError";
  }
}

export interface ClipSlot {
  release(): void;
}

/**
 * Reserve a clip-processing slot, or throw ClipCapacityError if the global cap or
 * this user's in-flight cap is already full. Always `release()` in a `finally`.
 */
export function acquireClipSlot(userId: string): ClipSlot {
  const userCount = perUser.get(userId) ?? 0;
  if (active >= MAX_GLOBAL || userCount >= MAX_PER_USER) {
    throw new ClipCapacityError();
  }
  active += 1;
  perUser.set(userId, userCount + 1);
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      active -= 1;
      const next = (perUser.get(userId) ?? 1) - 1;
      if (next <= 0) perUser.delete(userId);
      else perUser.set(userId, next);
    },
  };
}

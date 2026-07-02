/**
 * Pure token-bucket math — no DB, no clock of its own (the caller passes `nowMs`).
 * The Postgres upsert in `rate-limit.ts` mirrors this exact logic in one atomic
 * statement; this module exists so the refill/consume behaviour is unit-testable
 * without a database. Standard token bucket: a denied request does NOT consume.
 */

export interface BucketState {
  tokens: number;
  updatedAtMs: number;
}

export interface BucketConfig {
  /** Burst size — the max tokens the bucket can hold. */
  capacity: number;
  /** Sustained rate — tokens added per second. */
  refillPerSec: number;
  /** Tokens this request costs (default 1). */
  cost?: number;
}

export interface BucketDecision {
  allowed: boolean;
  /** Tokens remaining after this call (never negative). */
  tokens: number;
  /** Seconds until `cost` tokens are available again (0 when allowed). */
  retryAfterSec: number;
}

/** Tokens available after refilling a bucket up to `nowMs` (never over capacity). */
export function refill(
  prev: BucketState | null,
  nowMs: number,
  cfg: BucketConfig,
): number {
  if (!prev) return cfg.capacity;
  const elapsedSec = Math.max(0, (nowMs - prev.updatedAtMs) / 1000);
  return Math.min(cfg.capacity, prev.tokens + elapsedSec * cfg.refillPerSec);
}

/** Refill then (if affordable) consume `cost`. A denial leaves tokens untouched. */
export function consume(
  prev: BucketState | null,
  nowMs: number,
  cfg: BucketConfig,
): BucketDecision {
  const cost = cfg.cost ?? 1;
  const start = refill(prev, nowMs, cfg);
  if (start >= cost) {
    return { allowed: true, tokens: start - cost, retryAfterSec: 0 };
  }
  const deficit = cost - start;
  const retryAfterSec =
    cfg.refillPerSec > 0 ? Math.ceil(deficit / cfg.refillPerSec) : Number.POSITIVE_INFINITY;
  return { allowed: false, tokens: start, retryAfterSec };
}

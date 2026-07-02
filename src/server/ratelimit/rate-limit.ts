/**
 * Postgres-backed rate limiting (no new infra — reuses the app DB).
 *
 * A single atomic upsert refills a per-key token bucket and consumes one token,
 * mirroring `token-bucket.ts`. Called at the top of Node-runtime route handlers
 * (NOT middleware — middleware runs on the Edge runtime, which cannot use the
 * postgres-js client). Keys are scoped `<name>:<ip|user>:<id>` so limits are
 * per-IP for public routes and per-identity for authenticated ones.
 *
 * Soft by design: under a concurrent burst to the SAME key the refill read is
 * unlocked, so a few extra requests may slip through — acceptable for abuse
 * control. Fails OPEN on a DB error (availability over strictness); the outage
 * that breaks the limiter already breaks the app.
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

export interface RateLimitConfig {
  /** Burst size. */
  capacity: number;
  /** Sustained tokens/sec. */
  refillPerSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

type HasHeaders = { headers: { get(name: string): string | null } };

/**
 * Best-effort client IP. Assumes a single trusted reverse proxy (nginx on the
 * droplet) sets `x-real-ip` / `x-forwarded-for`. Prefer `x-real-ip` (set by the
 * proxy to the direct peer, hardest to spoof); fall back to the first
 * `x-forwarded-for` hop, then a constant so a missing header can't split a
 * flood across unlimited keys.
 */
export function clientIp(req: HasHeaders): string {
  const real = req.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/**
 * Named per-route limits. `capacity` is the burst; `refillPerSec` the sustained
 * rate. Tuned for a public testnet on a single VPS — tighten later if abused.
 */
export const LIMITS = {
  // Unauthenticated, keyed by IP.
  nonce: { capacity: 15, refillPerSec: 15 / 60 }, // ~15/min
  authVerify: { capacity: 20, refillPerSec: 20 / 60 },
  agentAuth: { capacity: 10, refillPerSec: 10 / 60 }, // SIWE recovery is CPU-heavy
  publicSearch: { capacity: 20, refillPerSec: 20 / 60 }, // /find embed path
  claim: { capacity: 30, refillPerSec: 30 / 60 },
  // Authenticated, keyed by userId/credential.
  search: { capacity: 40, refillPerSec: 40 / 60 },
  curation: { capacity: 20, refillPerSec: 20 / 60 },
  withdraw: { capacity: 6, refillPerSec: 6 / 60 },
  grantCreate: { capacity: 25, refillPerSec: 15 / 60 },
  keyCreate: { capacity: 10, refillPerSec: 5 / 60 },
  presign: { capacity: 12, refillPerSec: 12 / 60 },
  youtubeList: { capacity: 15, refillPerSec: 15 / 60 }, // outbound OAuth refresh + YouTube API reads
  importVideo: { capacity: 4, refillPerSec: 2 / 60 }, // heavy: yt-dlp + ffmpeg
  mcp: { capacity: 80, refillPerSec: 80 / 60 },
  mutation: { capacity: 60, refillPerSec: 60 / 60 }, // generic authed writes
} as const satisfies Record<string, RateLimitConfig>;

export type LimitName = keyof typeof LIMITS;

/**
 * Atomically refill-then-consume one token for `key`. Returns whether the
 * request is allowed and, if not, a Retry-After hint in seconds.
 */
export async function rateLimit(
  name: LimitName,
  scopeId: string,
  cfg: RateLimitConfig = LIMITS[name],
): Promise<RateLimitResult> {
  const key = `${name}:${scopeId}`;
  const cap = cfg.capacity;
  const rate = cfg.refillPerSec;
  try {
    const rows = (await db.execute(sql`
      WITH refill AS (
        SELECT COALESCE(
          (SELECT LEAST(${cap}::real, tokens + (EXTRACT(EPOCH FROM (now() - updated_at)) * ${rate})::real)
             FROM rate_limit_buckets WHERE key = ${key}),
          ${cap}::real
        ) AS start_tokens
      ),
      decided AS (
        SELECT
          start_tokens,
          (start_tokens >= 1) AS allowed,
          GREATEST(CASE WHEN start_tokens >= 1 THEN start_tokens - 1 ELSE start_tokens END, 0::real) AS new_tokens
        FROM refill
      ),
      upsert AS (
        INSERT INTO rate_limit_buckets (key, tokens, updated_at)
        SELECT ${key}, new_tokens, now() FROM decided
        ON CONFLICT (key) DO UPDATE SET tokens = EXCLUDED.tokens, updated_at = now()
        RETURNING tokens
      )
      SELECT decided.allowed AS allowed, decided.start_tokens AS start_tokens FROM decided
    `)) as unknown as Array<{ allowed: boolean; start_tokens: number }>;

    const row = rows?.[0];
    if (!row) return { allowed: true, retryAfterSec: 0 };
    if (row.allowed) return { allowed: true, retryAfterSec: 0 };
    const deficit = 1 - Number(row.start_tokens);
    const retryAfterSec = rate > 0 ? Math.max(1, Math.ceil(deficit / rate)) : 60;
    return { allowed: false, retryAfterSec };
  } catch (e) {
    // Fail open: never let a limiter DB hiccup lock every user out.
    console.error("[rateLimit] query failed, allowing:", e);
    return { allowed: true, retryAfterSec: 0 };
  }
}

/** Standard 429 body with a Retry-After header. */
export function tooManyRequests(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "rate_limited", retryAfterSeconds: retryAfterSec },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSec))) } },
  );
}

/**
 * Convenience guard for route handlers: returns a 429 NextResponse to return
 * immediately, or null when the request may proceed.
 *   const limited = await enforceRateLimit("search", actor.userId);
 *   if (limited) return limited;
 */
export async function enforceRateLimit(
  name: LimitName,
  scopeId: string,
): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await rateLimit(name, scopeId);
  return allowed ? null : tooManyRequests(retryAfterSec);
}

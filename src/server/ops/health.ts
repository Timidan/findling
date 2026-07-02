/**
 * Deep health probe (backs GET /api/healthz).
 *
 * Beyond "is the process up + can it reach the DB", this checks every dependency
 * the marketplace actually needs to serve a request end-to-end: config, DB,
 * object storage, the payment provider, the embedding provider, and the media
 * binaries (ffmpeg/ffprobe/yt-dlp). Each check reports its own `ok` plus a short
 * reason; the overall status is driven only by the CRITICAL checks so a missing
 * dev tool (e.g. yt-dlp) reports "degraded" without 503-ing the whole service.
 *
 * Results are cached in-memory for a few seconds so a monitor polling every
 * second doesn't hammer the DB / storage / spawn `which` on every hit.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { supabaseStorage } from "@/server/storage/supabase-storage";
import { getGatewayProvider } from "@/server/payment";
import { getEmbeddingProvider } from "@/server/search";

const execFileP = promisify(execFile);

const REQUIRED_ENV = [
  "NEXT_PUBLIC_APP_URL",
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_SESSION_SECRET",
  "GATEWAY_FACILITATOR_URL",
  "SELLER_ADDRESS",
] as const;

/** Media binaries the clip pipeline shells out to. */
const MEDIA_BINARIES = ["ffmpeg", "ffprobe", "yt-dlp"] as const;

export interface Check {
  ok: boolean;
  /** Short human-readable detail (safe to expose; no secrets). */
  detail?: string;
}

export interface HealthReport {
  ok: boolean;
  status: "ok" | "degraded" | "error";
  service: "findling";
  checks: {
    env: Check;
    database: Check;
    storage: Check;
    payment: Check;
    embedding: Check;
    media: Check;
  };
}

/**
 * Which checks gate the HTTP status. A failure here → 503. Non-critical checks
 * (embedding, media) surface in the body and downgrade `status` to "degraded"
 * but keep the service reporting 200 so an orchestrator doesn't cycle the pod
 * over a soft dependency.
 */
const CRITICAL: ReadonlyArray<keyof HealthReport["checks"]> = [
  "env",
  "database",
  "storage",
  "payment",
];

const CACHE_TTL_MS = 5_000;
let cache: { at: number; report: HealthReport } | null = null;

function checkEnv(): Check {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  return missing.length === 0
    ? { ok: true }
    : { ok: false, detail: `missing: ${missing.join(", ")}` };
}

async function checkDatabase(): Promise<Check> {
  try {
    await db.execute(sql`select 1`);
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: errText(err) };
  }
}

async function checkStorage(): Promise<Check> {
  try {
    // Cheap reachability + credential check: listing a key that doesn't exist
    // returns null (not an error), proving the bucket is reachable and the
    // service-role key is valid — without moving any bytes.
    await supabaseStorage.getObjectInfo("healthz/__probe__");
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: errText(err) };
  }
}

function checkPayment(): Check {
  try {
    // Constructing the provider validates required config (facilitator + seller)
    // without a network round-trip; it throws when unconfigured.
    getGatewayProvider();
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: errText(err) };
  }
}

function checkEmbedding(): Check {
  try {
    // Resolving the provider validates the EMBEDDING_PROVIDER selection + keys
    // (fail-closed in prod) without embedding anything.
    const provider = getEmbeddingProvider();
    return { ok: true, detail: `${provider.provider}/${provider.model}` };
  } catch (err) {
    return { ok: false, detail: errText(err) };
  }
}

async function checkMedia(): Promise<Check> {
  const results = await Promise.all(
    MEDIA_BINARIES.map(async (bin): Promise<string | null> => {
      try {
        await execFileP("which", [bin]);
        return null;
      } catch {
        return bin;
      }
    }),
  );
  const missing = results.filter((b): b is string => b !== null);
  return missing.length === 0
    ? { ok: true }
    : { ok: false, detail: `missing: ${missing.join(", ")}` };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Run every check (bypassing the cache) and assemble the report. */
async function computeHealth(): Promise<HealthReport> {
  const [database, storage, media] = await Promise.all([
    checkDatabase(),
    checkStorage(),
    checkMedia(),
  ]);
  const checks: HealthReport["checks"] = {
    env: checkEnv(),
    database,
    storage,
    payment: checkPayment(),
    embedding: checkEmbedding(),
    media,
  };

  const criticalOk = CRITICAL.every((name) => checks[name].ok);
  const allOk = (Object.keys(checks) as Array<keyof typeof checks>).every(
    (name) => checks[name].ok,
  );
  const status: HealthReport["status"] = !criticalOk
    ? "error"
    : allOk
      ? "ok"
      : "degraded";

  return { ok: criticalOk, status, service: "findling", checks };
}

/**
 * Cached health report. `ok` reflects only the critical checks (drives the
 * 200/503 in the route); `status` distinguishes ok / degraded / error.
 */
export async function getHealth(): Promise<HealthReport> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.report;
  const report = await computeHealth();
  cache = { at: now, report };
  return report;
}

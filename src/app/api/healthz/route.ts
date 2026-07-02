import { getHealth, type Check } from "@/server/ops/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deep readiness probe. Beyond env + DB it checks storage, the payment and
 * embedding providers, and the media binaries (see server/ops/health.ts). The
 * report is cached ~5s so frequent monitors don't hammer the dependencies.
 *
 * HTTP status is driven by the CRITICAL checks only: 200 when healthy (even if
 * "degraded" by a soft dependency like a missing dev tool), 503 when a critical
 * check fails. Per-check `detail` strings can hint at config, so they're only
 * exposed outside production.
 */
export async function GET() {
  const report = await getHealth();
  const exposeDetail = process.env.NODE_ENV !== "production";

  const shape = (c: Check) =>
    exposeDetail ? c : { ok: c.ok };

  return Response.json(
    {
      ok: report.ok,
      status: report.status,
      service: report.service,
      checks: {
        env: shape(report.checks.env),
        database: shape(report.checks.database),
        storage: shape(report.checks.storage),
        payment: shape(report.checks.payment),
        embedding: shape(report.checks.embedding),
        media: shape(report.checks.media),
      },
    },
    {
      status: report.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

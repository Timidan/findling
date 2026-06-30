import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_APP_URL",
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_SESSION_SECRET",
  "GATEWAY_FACILITATOR_URL",
  "SELLER_ADDRESS",
] as const;

function missingEnv(): string[] {
  return REQUIRED_ENV.filter((key) => !process.env[key]);
}

export async function GET() {
  const missing = missingEnv();
  let database: "ok" | "error" = "ok";
  let databaseError: string | undefined;

  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    database = "error";
    databaseError = err instanceof Error ? err.message : String(err);
  }

  const ok = missing.length === 0 && database === "ok";
  return Response.json(
    {
      ok,
      service: "findling",
      database,
      missingEnv: missing,
      ...(databaseError && process.env.NODE_ENV !== "production" ? { databaseError } : {}),
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

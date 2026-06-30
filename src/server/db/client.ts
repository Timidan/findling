import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy connection string: an empty value is fine at import time (build/static
// generation never connects); a real query without DATABASE_URL will throw.
const connectionString = process.env.DATABASE_URL ?? "";

// Reuse ONE pool across Next dev HMR recompiles. Without this, every hot-reload
// re-evaluates this module and leaks a fresh postgres pool, eventually
// exhausting Supabase's client limit ("too many clients already"). Bounded +
// idle-timeout so connections return to the pooler promptly.
// `prepare: false` is required for Supabase's transaction pooler (pgbouncer).
const globalForDb = globalThis as unknown as {
  __findlingPg?: ReturnType<typeof postgres>;
};
const queryClient =
  globalForDb.__findlingPg ??
  postgres(connectionString, { prepare: false, max: 5, idle_timeout: 20 });
if (process.env.NODE_ENV !== "production") globalForDb.__findlingPg = queryClient;

export const db = drizzle(queryClient, { schema });
export { schema };

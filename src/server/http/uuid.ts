/**
 * UUID validation for route params that flow into a Postgres `uuid` column.
 *
 * Passing a non-UUID string (e.g. `/m/not-a-uuid`) straight into a `uuid` query
 * makes Postgres raise `22P02 invalid input syntax for type uuid`, which surfaces
 * as an unhandled 500 on PUBLIC endpoints (moment unlock, `/m/[id]`, `/trace`).
 * Guard with `isUuid()` and return a clean 404/notFound instead.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

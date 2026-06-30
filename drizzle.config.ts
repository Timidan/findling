import { defineConfig } from "drizzle-kit";

// drizzle-kit does not auto-load Next's `.env.local`, so `pnpm db:*` would see an
// empty DATABASE_URL. Load it the way the app does (best-effort; CI/real env wins
// because process.env is already populated there and the file simply won't exist).
try {
  (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  /* no .env.local present — fall through to process.env */
}

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});

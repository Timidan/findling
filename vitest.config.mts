import { defineConfig } from "vitest/config";
import path from "node:path";

// `.mts` (explicit ESM) so vitest loads this via import() — a plain `.ts` config
// is require()'d in this CommonJS project and fails on ESM-only vite.
//
// Resolve the `@/*` path alias (tsconfig `paths`) for vitest the same way
// Next/tsc do. Without this, an UNMOCKED `@/...` import in loaded source fails
// to resolve (vitest doesn't read tsconfig paths on its own), so a route that
// imports e.g. `@/server/ratelimit/rate-limit` breaks any test that loads it.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});

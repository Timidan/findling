<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Contributing to Findling

Findling is an agent-payable marketplace for licensable video moments (USDC
nanopayments over x402/Circle on Arc). Money is **integer micro-USDC** (1 USDC =
1,000,000) everywhere — never use floats for money.

## Orientation
- **Architecture & data model:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — start here.
- **Schema is the source of truth:** [src/server/db/schema.ts](src/server/db/schema.ts).
- **Agent surface (live):** `GET /skill.md`; mirrored over REST (`/api/agent/*`,
  plus `/api/payments/.../unlock` and `/api/earnings/withdraw`) and MCP
  ([src/server/mcp/server.ts](src/server/mcp/server.ts), hosted at `/api/mcp`).
- **Known issues / audit:** [docs/AUDIT.md](docs/AUDIT.md).

## Setup
1. `pnpm install`
2. `cp .env.example .env.local` and fill it in (DB, Supabase + a `moments`
   storage bucket, Circle/Arc, `AUTH_SESSION_SECRET` via `openssl rand -hex 32`).
3. `pnpm db:migrate` (drizzle-kit; loads `.env.local`).
4. `pnpm dev`

## Conventions
- **Layering:** routes validate/orchestrate; domain rules + transaction
  boundaries live in `src/server/*` services.
- **Auth:** humans via SIWE session cookie; agents via wallet-proven bearer key.
  Money/owned resources are owner-scoped — resolve identity with `getActor`,
  never trust a body-supplied `userId`.
- **Validate inputs at the boundary** (prefer zod) and clamp anything that flows
  into a DB `LIMIT` or a paid provider.

## Before you push
Run the full gate — it must be green:
```bash
pnpm preflight   # lint + tsc --noEmit + vitest + build
```
Use `pnpm deploy:check` (or `deploy:check:full`) to validate prod env vars.

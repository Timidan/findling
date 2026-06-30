-- Enable Row-Level Security (deny-by-default) on every public table.
--
-- WHY: this is a Supabase Postgres. Supabase exposes a PostgREST Data API over
-- the `public` schema reachable with the project's public anon key. With RLS
-- OFF, anyone holding the project URL + anon key can read/write every row.
-- The Security Advisor `rls_disabled_in_public` alert flags exactly this.
--
-- SAFE because the app does NOT use the Data API. Drizzle connects directly as
-- the `postgres` role over DATABASE_URL (see src/server/db/client.ts), and the
-- table owner / superuser BYPASSES RLS. Storage uses the service-role key. So
-- the app keeps full access while anon/authenticated get zero rows (no policies
-- are added -> default-deny). We use ENABLE, NOT FORCE: FORCE would also subject
-- the owner to RLS and break the app.
--
-- Defense-in-depth (do this in the dashboard too): Project Settings -> API,
-- restrict exposed schemas to exclude `public` (or disable the Data API).

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "siwe_nonces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clip_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "moments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "moment_embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "curations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "buyer_session_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "withdrawals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;

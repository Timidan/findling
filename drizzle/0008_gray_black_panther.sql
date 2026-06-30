CREATE TYPE "public"."claimable_external_identity_kind" AS ENUM('youtube_channel', 'peertube_channel', 'activitypub_actor', 'handle', 'url');--> statement-breakpoint
CREATE TYPE "public"."claimable_listing_status" AS ENUM('open', 'claimed', 'activated', 'expired');--> statement-breakpoint
CREATE TYPE "public"."demand_intent_status" AS ENUM('pledged', 'notified', 'settled', 'lapsed');--> statement-breakpoint
CREATE TABLE "claimable_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finder_id" uuid NOT NULL,
	"external_identity" text NOT NULL,
	"external_identity_kind" "claimable_external_identity_kind" NOT NULL,
	"external_ref" text,
	"external_ref_normalized" text,
	"title" text NOT NULL,
	"description" text,
	"relevance_text" text,
	"claim_secret_hash" text NOT NULL,
	"status" "claimable_listing_status" DEFAULT 'open' NOT NULL,
	"claimed_by_user_id" uuid,
	"claimed_at" timestamp with time zone,
	"created_moment_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"session_grant_id" uuid NOT NULL,
	"budget_micro_usdc" bigint NOT NULL,
	"usage_type" "usage_type",
	"status" "demand_intent_status" DEFAULT 'pledged' NOT NULL,
	"agent_run_id" uuid,
	"settled_purchase_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claimable_listings" ADD CONSTRAINT "claimable_listings_finder_id_users_id_fk" FOREIGN KEY ("finder_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claimable_listings" ADD CONSTRAINT "claimable_listings_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claimable_listings" ADD CONSTRAINT "claimable_listings_created_moment_id_moments_id_fk" FOREIGN KEY ("created_moment_id") REFERENCES "public"."moments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_intents" ADD CONSTRAINT "demand_intents_listing_id_claimable_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."claimable_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_intents" ADD CONSTRAINT "demand_intents_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_intents" ADD CONSTRAINT "demand_intents_session_grant_id_buyer_session_grants_id_fk" FOREIGN KEY ("session_grant_id") REFERENCES "public"."buyer_session_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_intents" ADD CONSTRAINT "demand_intents_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_intents" ADD CONSTRAINT "demand_intents_settled_purchase_id_purchases_id_fk" FOREIGN KEY ("settled_purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claimable_listings_status_idx" ON "claimable_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "claimable_listings_finder_idx" ON "claimable_listings" USING btree ("finder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claimable_listings_claim_secret_hash_uq" ON "claimable_listings" USING btree ("claim_secret_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "claimable_listings_external_ref_live_uq" ON "claimable_listings" USING btree ("external_identity_kind","external_ref_normalized") WHERE "claimable_listings"."external_ref_normalized" IS NOT NULL AND "claimable_listings"."status" IN ('open', 'claimed');--> statement-breakpoint
CREATE UNIQUE INDEX "demand_intents_buyer_listing_uq" ON "demand_intents" USING btree ("buyer_id","listing_id");--> statement-breakpoint
CREATE INDEX "demand_intents_listing_status_idx" ON "demand_intents" USING btree ("listing_id","status");--> statement-breakpoint
CREATE INDEX "demand_intents_buyer_status_idx" ON "demand_intents" USING btree ("buyer_id","status");--> statement-breakpoint
ALTER TABLE "claimable_listings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demand_intents" ENABLE ROW LEVEL SECURITY;

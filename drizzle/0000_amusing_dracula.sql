CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."agent_payment_status" AS ENUM('not_attempted', 'requires_payment', 'settled', 'failed', 'refused');--> statement-breakpoint
CREATE TYPE "public"."agent_surface" AS ENUM('mcp', 'rest', 'demo_harness', 'feed', 'overlay');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('draft', 'published', 'disabled', 'takedown_pending');--> statement-breakpoint
CREATE TYPE "public"."clip_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."embedding_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."grant_status" AS ENUM('pending', 'active', 'revoked', 'expired', 'exhausted');--> statement-breakpoint
CREATE TYPE "public"."moment_status" AS ENUM('draft', 'published', 'disabled', 'takedown_pending');--> statement-breakpoint
CREATE TYPE "public"."ownership_model" AS ENUM('channel_control', 'contributor_attestation');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('gateway_x402', 'mock');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('pending', 'settled', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('received', 'takedown_pending', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('creator', 'finder', 'buyer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."source_surface" AS ENUM('feed', 'overlay', 'share_link', 'seed');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('upload', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."usage_type" AS ENUM('video_embed', 'newsletter', 'social_post', 'internal_reference');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_role" AS ENUM('creator', 'finder');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_status" AS ENUM('requested', 'submitted', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid,
	"session_grant_id" uuid,
	"surface" "agent_surface" NOT NULL,
	"request_text" text NOT NULL,
	"parsed_constraints" jsonb,
	"candidate_moment_ids" text[],
	"candidate_scores" jsonb,
	"chosen_moment_id" uuid,
	"chosen_curation_id" uuid,
	"chosen_finder_id" uuid,
	"attribution_reason" text,
	"budget_micro_usdc" bigint,
	"payment_status" "agent_payment_status" DEFAULT 'not_attempted' NOT NULL,
	"payment_reference" text,
	"purchase_id" uuid,
	"receipt_id" uuid,
	"refusal_reason" text,
	"trace" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"source_type" "source_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"media_type" text DEFAULT 'video' NOT NULL,
	"original_storage_key" text,
	"original_mime_type" text,
	"original_size_bytes" bigint,
	"original_duration_ms" integer,
	"youtube_video_id" text,
	"youtube_channel_id" text,
	"youtube_channel_title" text,
	"source_url" text,
	"ownership_model" "ownership_model" NOT NULL,
	"ownership_verified" boolean DEFAULT false NOT NULL,
	"attestation_text" text,
	"attestation_version" text,
	"attestation_at" timestamp with time zone,
	"status" "asset_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_session_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"session_key_address" text NOT NULL,
	"chain" text DEFAULT 'arcTestnet' NOT NULL,
	"gateway_balance_reference" text,
	"total_cap_micro_usdc" bigint NOT NULL,
	"remaining_cap_micro_usdc" bigint NOT NULL,
	"per_purchase_cap_micro_usdc" bigint,
	"gas_buffer_micro_usdc" bigint,
	"allowed_usage_types" "usage_type"[],
	"expires_at" timestamp with time zone,
	"status" "grant_status" DEFAULT 'pending' NOT NULL,
	"provider_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clip_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"source_type" "source_type" NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"status" "clip_job_status" DEFAULT 'queued' NOT NULL,
	"input_reference" text,
	"output_storage_key" text,
	"poster_storage_key" text,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "curations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moment_id" uuid NOT NULL,
	"finder_id" uuid NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"caption" text,
	"use_case_note" text,
	"share_slug" text,
	"source_surface" "source_surface" DEFAULT 'feed' NOT NULL,
	"relevance_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curations_share_slug_unique" UNIQUE("share_slug")
);
--> statement-breakpoint
CREATE TABLE "moment_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moment_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"source_text_hash" text NOT NULL,
	"source_text" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"clip_job_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"clip_storage_key" text,
	"clip_mime_type" text,
	"clip_size_bytes" bigint,
	"poster_storage_key" text,
	"thumbnail_url" text,
	"price_micro_usdc" bigint NOT NULL,
	"price_usd_snapshot" text NOT NULL,
	"usage_type" "usage_type" DEFAULT 'video_embed' NOT NULL,
	"license_summary" text,
	"ownership_verified" boolean DEFAULT false NOT NULL,
	"attestation_at" timestamp with time zone,
	"embedding_status" "embedding_status" DEFAULT 'pending' NOT NULL,
	"status" "moment_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moment_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"curation_id" uuid,
	"creator_id" uuid NOT NULL,
	"finder_id" uuid,
	"gross_micro_usdc" bigint NOT NULL,
	"creator_micro_usdc" bigint NOT NULL,
	"finder_micro_usdc" bigint NOT NULL,
	"platform_micro_usdc" bigint NOT NULL,
	"remainder_policy" text DEFAULT 'creator_receives_remainder' NOT NULL,
	"payment_reference" text NOT NULL,
	"network" text DEFAULT 'arcTestnet' NOT NULL,
	"seller_address" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"status" "purchase_status" DEFAULT 'pending' NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "purchases_split_sums_to_gross" CHECK ("status" <> 'settled' OR "gross_micro_usdc" = "creator_micro_usdc" + "finder_micro_usdc" + "platform_micro_usdc")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"receipt_code" text NOT NULL,
	"public_slug" text NOT NULL,
	"moment_title" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"usage_type" "usage_type" NOT NULL,
	"license_summary" text,
	"attribution_text" text,
	"payment_reference" text NOT NULL,
	"network" text NOT NULL,
	"gross_micro_usdc" bigint NOT NULL,
	"creator_micro_usdc" bigint NOT NULL,
	"finder_micro_usdc" bigint NOT NULL,
	"platform_micro_usdc" bigint NOT NULL,
	"clip_storage_key_snapshot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_receipt_code_unique" UNIQUE("receipt_code"),
	CONSTRAINT "receipts_public_slug_unique" UNIQUE("public_slug")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid,
	"asset_id" uuid,
	"moment_id" uuid,
	"reason" text NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supabase_user_id" text,
	"email" text NOT NULL,
	"display_name" text,
	"roles" "role"[] DEFAULT '{}' NOT NULL,
	"wallet_address" text,
	"payout_wallet_address" text,
	"youtube_channel_id" text,
	"youtube_channel_title" text,
	"youtube_refresh_token_ciphertext" text,
	"youtube_connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_supabase_user_id_unique" UNIQUE("supabase_user_id")
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"recipient_wallet_address" text NOT NULL,
	"role" "withdrawal_role" NOT NULL,
	"amount_micro_usdc" bigint NOT NULL,
	"max_fee" text,
	"network" text DEFAULT 'arcTestnet' NOT NULL,
	"provider" "payment_provider" DEFAULT 'gateway_x402' NOT NULL,
	"gateway_withdraw_reference" text,
	"transaction_hash" text,
	"status" "withdrawal_status" DEFAULT 'requested' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_grant_id_buyer_session_grants_id_fk" FOREIGN KEY ("session_grant_id") REFERENCES "public"."buyer_session_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_chosen_moment_id_moments_id_fk" FOREIGN KEY ("chosen_moment_id") REFERENCES "public"."moments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_chosen_curation_id_curations_id_fk" FOREIGN KEY ("chosen_curation_id") REFERENCES "public"."curations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_chosen_finder_id_users_id_fk" FOREIGN KEY ("chosen_finder_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_session_grants" ADD CONSTRAINT "buyer_session_grants_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_jobs" ADD CONSTRAINT "clip_jobs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_jobs" ADD CONSTRAINT "clip_jobs_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curations" ADD CONSTRAINT "curations_moment_id_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."moments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curations" ADD CONSTRAINT "curations_finder_id_users_id_fk" FOREIGN KEY ("finder_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_embeddings" ADD CONSTRAINT "moment_embeddings_moment_id_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."moments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_clip_job_id_clip_jobs_id_fk" FOREIGN KEY ("clip_job_id") REFERENCES "public"."clip_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_moment_id_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."moments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_curation_id_curations_id_fk" FOREIGN KEY ("curation_id") REFERENCES "public"."curations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_finder_id_users_id_fk" FOREIGN KEY ("finder_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_moment_id_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."moments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "curations_moment_idx" ON "curations" USING btree ("moment_id");--> statement-breakpoint
CREATE INDEX "moment_embeddings_moment_idx" ON "moment_embeddings" USING btree ("moment_id");--> statement-breakpoint
CREATE INDEX "moment_embeddings_hnsw" ON "moment_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "moments_status_idx" ON "moments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "moments_creator_idx" ON "moments" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "purchases_moment_idx" ON "purchases" USING btree ("moment_id");--> statement-breakpoint
CREATE INDEX "purchases_creator_idx" ON "purchases" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "purchases_finder_idx" ON "purchases" USING btree ("finder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_provider_network_ref_uq" ON "purchases" USING btree ("provider","network","payment_reference");
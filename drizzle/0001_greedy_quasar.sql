DROP INDEX "moment_embeddings_moment_idx";--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "session_grant_id" uuid;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "payer_address" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "attribution_reason" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "curation_score" real;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "creator_id" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "finder_id" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "ownership_model" "ownership_model";--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "attestation_version" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "attestation_text" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "attestation_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_session_grant_id_buyer_session_grants_id_fk" FOREIGN KEY ("session_grant_id") REFERENCES "public"."buyer_session_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_finder_id_users_id_fk" FOREIGN KEY ("finder_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grants_buyer_status_idx" ON "buyer_session_grants" USING btree ("buyer_id","status");--> statement-breakpoint
CREATE INDEX "grants_session_key_idx" ON "buyer_session_grants" USING btree ("session_key_address");--> statement-breakpoint
CREATE INDEX "grants_expires_idx" ON "buyer_session_grants" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "moment_embeddings_unique" ON "moment_embeddings" USING btree ("moment_id","provider","model");--> statement-breakpoint
CREATE INDEX "withdrawals_recipient_idx" ON "withdrawals" USING btree ("recipient_user_id");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_purchase_id_unique" UNIQUE("purchase_id");--> statement-breakpoint
ALTER TABLE "buyer_session_grants" ADD CONSTRAINT "grants_caps_valid" CHECK ("total_cap_micro_usdc" > 0 AND "remaining_cap_micro_usdc" >= 0 AND "remaining_cap_micro_usdc" <= "total_cap_micro_usdc");--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_price_positive" CHECK (price_micro_usdc > 0);--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_amount_positive" CHECK ("amount_micro_usdc" > 0);
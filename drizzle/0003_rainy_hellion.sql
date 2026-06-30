ALTER TABLE "moments" ADD COLUMN "preview_storage_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawals_tx_hash_uq" ON "withdrawals" USING btree ("transaction_hash") WHERE transaction_hash IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawals_gateway_ref_uq" ON "withdrawals" USING btree ("gateway_withdraw_reference") WHERE gateway_withdraw_reference IS NOT NULL;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_duration_positive" CHECK (duration_ms > 0);--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_clip_range" CHECK (end_ms >= start_ms);--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_published_has_clip" CHECK (status <> 'published' OR clip_storage_key IS NOT NULL);--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_split_nonneg" CHECK ("gross_micro_usdc" >= 0 AND "creator_micro_usdc" >= 0 AND "finder_micro_usdc" >= 0 AND "platform_micro_usdc" >= 0);
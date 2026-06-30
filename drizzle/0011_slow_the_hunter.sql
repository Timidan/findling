CREATE TYPE "public"."purchase_reservation_status" AS ENUM('pending', 'recording', 'settled', 'released');--> statement-breakpoint
CREATE TABLE "purchase_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moment_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"session_grant_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"purchase_id" uuid,
	"amount_micro_usdc" bigint NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"seller_address" text NOT NULL,
	"payer_address" text NOT NULL,
	"payment_header_hash" text NOT NULL,
	"settled_payment_reference" text,
	"settled_network" text,
	"status" "purchase_reservation_status" DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "purchase_reservations_amount_positive" CHECK ("amount_micro_usdc" > 0)
);
--> statement-breakpoint
ALTER TABLE "purchase_reservations" ADD CONSTRAINT "purchase_reservations_moment_id_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."moments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_reservations" ADD CONSTRAINT "purchase_reservations_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_reservations" ADD CONSTRAINT "purchase_reservations_session_grant_id_buyer_session_grants_id_fk" FOREIGN KEY ("session_grant_id") REFERENCES "public"."buyer_session_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_reservations" ADD CONSTRAINT "purchase_reservations_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_reservations" ADD CONSTRAINT "purchase_reservations_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_reservations_status_idx" ON "purchase_reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_reservations_payment_hash_idx" ON "purchase_reservations" USING btree ("provider","payment_header_hash");--> statement-breakpoint
CREATE INDEX "purchase_reservations_grant_idx" ON "purchase_reservations" USING btree ("session_grant_id","status");
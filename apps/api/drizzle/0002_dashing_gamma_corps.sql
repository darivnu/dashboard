CREATE TYPE "public"."subscription_status" AS ENUM('active', 'needs_reauth', 'revoked');--> statement-breakpoint
CREATE TABLE "service_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"service_id" text NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"credentials" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_subscriptions" ADD CONSTRAINT "service_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_subscriptions_user_service_idx" ON "service_subscriptions" USING btree ("user_id","service_id");
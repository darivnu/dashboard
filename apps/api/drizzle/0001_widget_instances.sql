CREATE TABLE "widget_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"service_id" text NOT NULL,
	"widget_id" text NOT NULL,
	"title" text,
	"params" jsonb NOT NULL,
	"refresh_seconds" integer NOT NULL,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"w" integer DEFAULT 4 NOT NULL,
	"h" integer DEFAULT 3 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "widget_instances_refresh_min" CHECK ("widget_instances"."refresh_seconds" >= 5),
	CONSTRAINT "widget_instances_layout_nonneg" CHECK ("widget_instances"."x" >= 0 AND "widget_instances"."y" >= 0 AND "widget_instances"."w" >= 1 AND "widget_instances"."h" >= 1)
);
--> statement-breakpoint
ALTER TABLE "widget_instances" ADD CONSTRAINT "widget_instances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "widget_instances_user_idx" ON "widget_instances" USING btree ("user_id");
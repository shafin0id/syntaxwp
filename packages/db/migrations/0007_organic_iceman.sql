ALTER TABLE "sites" ADD COLUMN "allowed_actions" json DEFAULT '[]'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "wp_admin_user" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "wp_admin_password" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "avg_order_value" integer DEFAULT 79;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "ssl_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "domain_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "cve_plugin_uniq_idx" ON "vulnerability_advisories" USING btree ("cve_id","plugin_slug");
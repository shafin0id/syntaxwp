ALTER TABLE "sites" ADD COLUMN "available_wp_version" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "themes" json DEFAULT '[]'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "plugin_inventory" ADD COLUMN "name" text;
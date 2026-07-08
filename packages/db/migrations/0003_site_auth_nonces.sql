CREATE TABLE "site_auth_nonces" (
	"site_id" uuid NOT NULL,
	"nonce" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "site_auth_nonces_site_id_nonce_pk" PRIMARY KEY("site_id","nonce")
);
--> statement-breakpoint
ALTER TABLE "site_auth_nonces" ADD CONSTRAINT "site_auth_nonces_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
CREATE TABLE "security_actions_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"target" text NOT NULL,
	"status" text NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now()
);

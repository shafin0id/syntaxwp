-- Append-only enforcement for audit_log (§14.2, Task A2.3).
--
-- RLS alone does not work here: local (and likely deployed) DATABASE_URL
-- connects as Postgres's `postgres` superuser, and superusers bypass RLS
-- unconditionally -- FORCE ROW LEVEL SECURITY does not change this (FORCE
-- only affects the table *owner*, not literal superusers). A BEFORE trigger
-- fires for every role including superusers, so it's what actually makes
-- this guarantee hold today. RLS + FORCE is layered on anyway as
-- defense-in-depth for a future non-superuser app role (flagged as a
-- pre-production follow-up in BACKEND-DEVELOPMENT-PLAN.md's A2 section) --
-- with no UPDATE/DELETE policy defined, RLS's default-deny-without-a-policy
-- behavior would independently block mutation for that future role even
-- without the trigger.
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_deny_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted (row id=%)', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_deny_update
  BEFORE UPDATE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_deny_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_deny_delete
  BEFORE DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_deny_mutation();
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_log_insert_only ON "audit_log" FOR INSERT WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY audit_log_select_all ON "audit_log" FOR SELECT USING (true);

-- SSE fan-out source for A5b.2 (§10.3). Every mutating action already
-- writes an audit_log row (A8.1's running requirement — every A3/A4/A5b
-- commit logs its own action in the same transaction it performs), so one
-- AFTER INSERT trigger here covers every event type the dashboard needs to
-- stream, instead of a separate NOTIFY call per call site. AFTER, not
-- BEFORE like 0001's append-only triggers — this doesn't need to run before
-- the row exists, and firing after commit-visible insert means row_to_json
-- sees the row exactly as persisted.
--
-- Payload is the raw row as JSON text (Postgres NOTIFY payloads are limited
-- to 8000 bytes) — apps/api/src/realtime/site-events.ts parses it and fans
-- out by site_id to whichever SSE connections are listening for that site.
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('site_events', row_to_json(NEW)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_notify_insert
  AFTER INSERT ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_notify();

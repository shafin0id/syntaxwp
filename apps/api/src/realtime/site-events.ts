import { EventEmitter } from "node:events";
import { sql } from "@syntaxwp/db";

// Shape of the raw row `row_to_json(NEW)` produces in migration
// 0006_audit_log_notify_trigger.sql — Postgres column names verbatim
// (snake_case), not Drizzle's camelCase mapping, since this bypasses the
// query builder entirely.
export interface SiteEvent {
  id: string;
  site_id: string;
  incident_id: string | null;
  work_order_id: string | null;
  event_type: string;
  actor: string;
  summary: string;
  evidence: unknown;
  created_at: string;
}

// One process-local fan-out point for every site's events, fed by a single
// shared LISTEN connection (below) — not one LISTEN per SSE client. Multiple
// API instances each open their own LISTEN independently; Postgres
// broadcasts a NOTIFY to every listening connection regardless of which
// instance opened it, so this scales horizontally for free (§10.3, A5b.2).
const emitter = new EventEmitter();
// Unbounded on purpose: one listener per open dashboard SSE connection is
// the expected shape here, not a leak — Node's default-10 cap would start
// warning long before that's actually a problem.
emitter.setMaxListeners(0);

let listening: Promise<void> | undefined;

function ensureListening(): Promise<void> {
  if (!listening) {
    listening = sql
      .listen("site_events", (payload) => {
        const event = JSON.parse(payload) as SiteEvent;
        emitter.emit(event.site_id, event);
      })
      .then(() => undefined);
  }
  return listening;
}

// Returns an unsubscribe function — callers (the SSE route) must call it
// when their stream ends, or the emitter keeps a dead callback forever.
export async function subscribeToSiteEvents(
  siteId: string,
  onEvent: (event: SiteEvent) => void,
): Promise<() => void> {
  await ensureListening();
  emitter.on(siteId, onEvent);
  return () => emitter.off(siteId, onEvent);
}

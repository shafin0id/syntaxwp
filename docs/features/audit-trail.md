# Audit Trail

## Product Summary

Every meaningful thing SyntaxWP does to a customer's site — diagnosing an incident, deciding to fix
it, asking for approval, claiming and running the fix, watching it succeed or fail, reverting it if
it didn't — leaves a permanent, plain-English record. That record can never be edited or deleted,
by anyone, including SyntaxWP's own engineers connected directly to the database with full admin
rights. If a customer ever needs to know exactly what happened to their site and why, or prove it to
someone else, the audit trail is the single, trustworthy source of truth — and because it streams
live to the dashboard, they can watch it happen in real time instead of refreshing a page.

## Technical Reference

### Schema (`packages/db/src/schema/audit-log.ts`)

`audit_log`: `id`, `site_id` (not null), `incident_id` (nullable), `work_order_id` (nullable),
`event_type`, `actor` (`'system'` or `'user:{id}'`), `summary` (plain English, always present),
`evidence` (nullable JSONB), `created_at`.

### Append-only enforcement (`packages/db/migrations/0001_audit_log_append_only.sql`, A2.3)

Postgres row-level security alone does **not** protect this table: this system's `DATABASE_URL`
connects as the `postgres` superuser (both locally and, currently, in production), and superusers
bypass RLS unconditionally — `FORCE ROW LEVEL SECURITY` only affects the table *owner*, not literal
superusers. What actually makes the guarantee hold is a `BEFORE UPDATE OR DELETE` trigger
(`audit_log_deny_mutation()`) that `RAISE EXCEPTION`s for every role, including superusers. RLS +
`FORCE ROW LEVEL SECURITY` + an insert/select-only policy are layered on top anyway as
defense-in-depth for a future non-superuser application role (a pre-production follow-up, not yet
built — see `BACKEND-DEVELOPMENT-PLAN.md`'s A2 notes).

Verified by `packages/db/src/repositories/audit-log.test.ts` against both mutation paths: a raw SQL
`UPDATE`/`DELETE` and Drizzle's own `.update()`/`.delete()` query builder each independently throw
`/append-only/i`.

### Writing an entry (`packages/db/src/repositories/audit-log.ts`)

`insertAuditLog(db, entry)` is the only way to write a row — there is deliberately no
`updateAuditLog`/`deleteAuditLog` export, so a future caller can't accidentally reach for a mutation
helper that would just fail at the database anyway. Every mutating action across A3–A8 calls it
inline, in the same transaction/request as the action it logs — this isn't centralized logging
middleware, each call site writes its own row with its own specific `event_type` and plain-English
`summary`:

| `event_type` | Written by |
|---|---|
| `work_order_issued` / `work_order_awaiting_approval` | `issueWorkOrder` (A8.1 fix — see below) |
| `work_order_approved` / `work_order_declined` | `POST /api/work-orders/:id/{approve,decline}` |
| `work_order_claimed` | `POST /api/sites/:id/work-orders/claim` |
| `work_order_executed` | `POST /api/work-orders/:id/result` |
| `dead_mans_switch_fired` | `deadMansSwitchFire` task |
| `work_order_reverted` / `revert_escalated_to_human` | `executeRevert` |
| (plugin-reported types, passthrough) | `POST /api/sites/:id/events` |

`issueWorkOrder` (`packages/db/src/repositories/work-orders.ts`) was the one mutating action in this
chain that didn't write its own row until A8.1 — every other step already did. Fixed by logging
inside `issueWorkOrder` itself rather than its policy-aware wrapper, so a revert's own
system-initiated corrective work order gets the same audit coverage as a policy-gated one, from a
single write site.

### Live streaming (`packages/db/migrations/0006_audit_log_notify_trigger.sql`, `apps/api/src/realtime/site-events.ts`, A5b.2)

An `AFTER INSERT` trigger on `audit_log` calls `pg_notify('site_events', row_to_json(NEW)::text)` —
one mechanism covers every event type the dashboard needs to stream, instead of a separate
application-level publish call per write site, since every mutating action already produces exactly
one `audit_log` row to hang the notification on. A single long-lived `LISTEN` connection per API
process fans out by `site_id` to a process-local `EventEmitter`; `GET /api/sites/:id/stream`
(session-authed, org-scoped SSE endpoint) subscribes to that. Scales horizontally for free: Postgres
broadcasts a `NOTIFY` to every listening connection regardless of which API instance opened it, so
adding more instances doesn't require any new fan-out logic.

### End-to-end verification (`apps/api/src/audit-trail.test.ts`, A8.1)

A single integration test drives the real incident → issue → approve → claim → execute → dead man's
switch fire → revert → escalate pipeline through the actual HTTP routes and task functions (signed
requests, a real Supabase Auth session, the real `deadMansSwitchFire` Graphile Worker task) — not
repository calls in isolation — and asserts the exact ordered `event_type` sequence landed in
`audit_log`, all sharing one `incident_id`:

```
work_order_awaiting_approval -> work_order_approved -> work_order_claimed ->
work_order_executed -> dead_mans_switch_fired -> work_order_reverted -> revert_escalated_to_human
```

This is the test that originally caught the `issueWorkOrder` gap above — it failed on a missing
`work_order_awaiting_approval` entry before that fix landed.

### CI (`.github/workflows/ci.yml`, A8.2)

Runs against a real `supabase start` stack (Postgres + Auth + Realtime — not a bare Postgres
container, since several suites, including this one, sign in a real Supabase Auth user) plus MinIO,
not mocks. There is no CI-only substitute for any of this — the same stack a developer runs locally
per `LOCAL-DEVELOPMENT-SETUP.md` §4/§5.

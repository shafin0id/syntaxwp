# Auto-Rollback Protection

## Product Summary

Every fix SyntaxWP applies is watched for a window after it runs. If the plugin never confirms the
site is still healthy within that window — because the fix broke something, the site went down, or
the plugin itself stopped responding — SyntaxWP automatically undoes the fix and escalates to a
human, without waiting for the customer to notice something is wrong first. This is the safety net
that makes automatic fixes trustworthy: SyntaxWP isn't just applying changes and hoping, it's
actively confirming they worked and reversing them the moment they don't.

Before applying a fix, SyntaxWP also captures a lightweight snapshot of the site's relevant state
(which plugins were active, at what versions) — the "before" picture a revert restores to. Old
snapshots are cleaned up automatically after 30 days; they're only useful for a limited window
after the fix they document.

## Technical Reference

### Dead man's switch (`apps/api/src/worker/tasks/dead-mans-switch.ts`)

A Graphile Worker job, armed the moment a work order's execution is reported (§9.2):

- **Arm** (`armDeadMansSwitch(workOrderId, timeoutMs)`) — schedules a `dead_mans_switch_fire` job
  keyed by `dms_{workOrderId}` (`jobKeyMode` defaults to `"replace"`, so re-arming the same work
  order — e.g. a retried execution report — replaces the existing scheduled fire rather than
  duplicating it), to run `timeoutMs` from now. `timeoutMs` is `dead_mans_switch_ms`, part of the
  work order's own signed payload, set at issuance.
- **Disarm** (`disarmDeadMansSwitch(workOrderId)`) — called once a healthy post-fix heartbeat or
  verification arrives; removes the scheduled job via `graphile_worker.remove_job` (a SQL function
  with no JS wrapper in the installed graphile-worker version, called directly through the shared
  `sql` client). A no-op, not an error, if the job already fired or was never armed.
- **Fire** (`deadMansSwitchFire` task) — re-checks the work order's current status first (a fast
  defensive short-circuit against a stale/duplicate fire under graphile-worker's at-least-once
  delivery, not the actual concurrency guard — that guard is `markWorkOrderReverted`'s conditional
  `WHERE status = 'executed'` update). If still `executed`, writes a `dead_mans_switch_fired`
  `audit_log` row, then calls `executeRevert`.

### Snapshots (`packages/db/src/schema/snapshots.ts`, `apps/api/src/snapshots/capture.ts`)

`captureSnapshot(db, { siteId, workOrderId })` runs before a risky action executes. Reads
`active_plugins` from `plugin_inventory` — kept fresh by every heartbeat (A5a.2b), not a live round
trip to the site at capture time. `options_checksum`/`file_checksums` are left `null` today: there
is no capability yet to read WP options or file contents back off a site (that needs a
request/response channel to the plugin — WP7 native abilities or a legacy poll-response, Task A7)
— persisting a fabricated checksum would be worse evidence during a revert than persisting nothing.
This is still a genuinely useful revert target: the policy engine already gates the two actions
this can fully capture and reverse (`deactivate_plugin`/`activate_plugin`) as `ask` or `allow`.

A daily Graphile Worker job (`snapshot_retention_sweep`, off-peak per `apps/api/crontab`) deletes
snapshot rows — and their R2/MinIO blob via `storage_key`, if any — once they're past the 30-day
retention window (§14.2). Deletes the Postgres row first, then the object: a crash between the two
leaves an orphaned blob (cheap, self-heals on the next run) rather than a DB row pointing at
nothing, which every future query would have to guard against.

### Revert (`apps/api/src/snapshots/revert.ts`)

`executeRevert(workOrderId)` — §8.1's "verification FAILED (or switch fires)" branch:

1. Looks up an inverse for the reverted action (`INVERSE_ACTION`: `deactivate_plugin` ↔
   `activate_plugin` today — the only two actions with a clean, mechanical inverse expressible with
   data already on hand). If one exists and the original work order had a `target`, issues a
   corrective work order for it via `issueWorkOrder` directly — **bypassing the policy engine on
   purpose**: requiring human "ask" approval to undo damage the system itself caused would leave a
   known-bad state in place until someone clicks a button.
2. Probes the site's own URL (`probeSiteHealth`) — a real HTTP round trip confirming the origin is
   still serving *something*, not the full Playwright-based visual/functional health check from §9.1
   (Track B's territory, not built yet). Still meaningful evidence to attach to the revert record.
3. Marks the original work order `reverted` (conditioned on it currently being `executed`).
4. Writes two `audit_log` rows: `work_order_reverted` (what was done, and whether a corrective order
   was queued) and `revert_escalated_to_human` — a revert *always* escalates to a human afterward,
   whether or not an automatic corrective action could also be queued.

Every other action either has no meaningful inverse (`flush_cache`, `toggle_debug`) or needs data
this platform can't yet read back off a site (the pre-update version for `update_plugin`, prior
option values for `update_option`) — those still get marked `reverted` and escalated, just without
a queued corrective order; the snapshot itself is preserved for a manual revert.

### Known limitations

- No automatic inverse exists yet for `update_plugin`, `update_core`, `delete_plugin`,
  `repair_db`, `switch_theme`, `update_option`, or `run_arbitrary_command` (blocked entirely
  regardless). A revert for any of these still fires, snapshots, and escalates — it just can't
  auto-correct, only alert a human with the evidence it captured.
- The health probe is reachability-only. Real content/functional verification (visual diff,
  WooCommerce checkout probe) is Track B's Playwright-based diagnostic runner, not built yet.

# Policy Engine & Approvals

## Product Summary

SyntaxWP can fix problems on a customer's WordPress site automatically, but it doesn't treat every
fix the same way. A cache flush and a plugin update carry very different risk, and a customer's
comfort with letting SyntaxWP act unsupervised varies too — some want everything handled
automatically, others want to review anything beyond the safest, most reversible actions. The
policy engine is the rule that reconciles the two: every fix SyntaxWP wants to perform is classified
by how risky it is, and the customer's own chosen autonomy level decides whether that fix runs
immediately or waits in the dashboard for a one-click approval first. One action — running an
arbitrary shell command — is never allowed automatically, for any customer, at any autonomy level;
it always requires a human, no exceptions.

Every fix is also cryptographically signed and time-limited before it ever reaches the customer's
site, so that even if someone intercepted or replayed a message, they couldn't use it to make the
site do something SyntaxWP never actually authorized.

## Technical Reference

### Risk classification (`packages/shared/src/actions.ts`)

`ACTION_RISK_MAP` is the single source of truth for how risky each of the 13 whitelisted actions is
— `low` | `medium` | `high` | `blocked`. This map must stay in sync with the WordPress plugin's own
`ActionWhitelist.php` (Task A6), which is the actual enforcement point on the site side; this is the
TypeScript-side contract issuance code consumes.

| Risk | Actions |
|---|---|
| low | `flush_cache`, `clear_transients`, `disable_maintenance_mode` |
| medium | `deactivate_plugin`, `activate_plugin`, `switch_theme`, `toggle_debug`, `update_option` |
| high | `update_plugin`, `update_core`, `delete_plugin`, `repair_db` |
| blocked | `run_arbitrary_command` |

### Policy decision (`packages/shared/src/policy.ts`)

```
policyDecision(action, tier) -> "allow" | "ask" | "block"
```

Ported verbatim from the architecture spec (§9.3), including that `full_auto` and `some_access`
currently behave identically — not an oversight, that's how the spec defines them today:

- `blocked` risk → always `block`, regardless of tier. There is no tier that ever allows
  `run_arbitrary_command`.
- `full_auto` / `some_access` tiers → `allow` for `low` risk, `ask` for everything else.
- `manual` tier → always `ask`.

A `block` decision means the work order is never created at all — nothing to approve, decline, or
audit for an action the system will never perform. An `ask` decision still creates and signs the
work order (so its evidence/reasoning exists for the approval UI to show), just starting in
`awaiting_approval` status instead of `pending`, so the plugin's claim endpoint can't pick it up
until a dashboard user approves it.

### Work order issuance & signing (`packages/db/src/repositories/work-orders.ts`)

`issueWorkOrderWithPolicy(db, input)` is the only path that should be used to create a work order
subject to policy — it calls `policyDecision` and sets the initial status accordingly.
`issueWorkOrder` (the lower-level function it wraps) is also called directly by the auto-revert path
(`apps/api/src/snapshots/revert.ts`) for system-initiated corrective actions, which deliberately
bypass the policy gate — requiring a human to approve undoing damage the system itself caused would
leave a known-bad state in place until someone clicks a button.

Every work order is HMAC-signed at issuance over its canonical fields (`id`, `site_id`, `action`,
`target`, `parameters`, `issued_at`, `expires_at`, `dead_mans_switch_ms`) using the site's own
secret. The work order's own `id` (a UUID) doubles as its replay nonce — no separate nonce column;
a UUID already has the properties a nonce needs. Canonicalization is
`packages/shared/src/hmac.ts`'s `canonicalizeForSigning` — recursively sort object keys
lexicographically, then JSON-encode — mirrored exactly in the plugin's PHP
(`packages/plugin/core/Hmac.php`) and pinned to the same golden fixture vectors
(`packages/shared/test/fixtures/work-order-hmac-vectors.json`) in both languages' test suites, so a
drift between the two implementations fails a test immediately instead of silently producing
mismatched signatures at runtime.

Work orders expire 5 minutes after issuance if nobody claims them (`expires_at`); a Graphile Worker
task (`work_order_expiry_sweep`, `apps/api/src/worker/tasks/`) runs every minute to move stale
`pending` rows to `expired` (never touches an already-claimed/executed/reverted order — expiry only
closes the *claim* window, it doesn't undo anything).

### Approval endpoints (`apps/api/src/routes/work-orders.ts`)

| Endpoint | Auth | Effect |
|---|---|---|
| `POST /api/work-orders/:id/approve` | session, org-scoped | `awaiting_approval` → `pending` |
| `POST /api/work-orders/:id/decline` | session, org-scoped | `awaiting_approval` → `declined` |

Both are atomic conditional updates (`WHERE status = 'awaiting_approval'` in the same statement as
the transition) — no read-then-write race between two approval clicks, and an undefined result
unambiguously means "not in a state this applies to" (already approved/declined/expired/claimed),
which the route turns into a `409`. Both write their own `audit_log` row
(`work_order_approved`/`work_order_declined`) with the acting user as `actor`.

### Known limitation

`policyDecision`'s `full_auto`/`some_access` branches are identical today — this is the architecture
spec's own current definition (§9.3), not a bug in this port. If those tiers are meant to diverge
further, that's a spec change, not an implementation fix.

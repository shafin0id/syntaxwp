# WordPress Plugin Security

## Product Summary

The SyntaxWP WordPress plugin is the only piece of this system that runs on a customer's own
server, so it's held to a stricter standard than the backend: it will never execute a command it
wasn't cryptographically authorized to run, it independently refuses to run anything outside a
fixed, hardcoded list of safe actions even if something upstream told it to, and it can shut itself
off — either on its own, after repeated failures, or remotely, from SyntaxWP's side — without
needing a plugin update to do it. If the main plugin ever crashes or gets deactivated unexpectedly,
a tiny, independent watchdog notices and reports it, so "SyntaxWP went silent" is itself something
the system finds out about rather than a customer having to notice their site stopped being
monitored.

The plugin supports two different WordPress environments: newer WordPress 7+ sites that can be
called directly through WordPress's own Abilities/MCP API, and any other supported site, which the
plugin polls on its own schedule instead. Both paths run through the exact same execution code and
the exact same safety checks — which path a site uses is purely about *how* a fix request reaches
the site, never about how carefully it's verified once it arrives.

## Technical Reference

### Plugin structure

`syntaxwp.php` bootstraps a singleton (`SyntaxWP::instance()`), OOP throughout — no procedural
top-level code beyond the singleton kickoff itself. Constants are defined inside a
`define_constants()` method hooked to `plugins_loaded` at priority 1 (not bare top-level `define()`
calls), so constant definition goes through the same hook-registration path as everything else the
plugin does. `init_hooks()` (default `plugins_loaded` priority) constructs each module once,
wiring the construction graph (e.g. `Heartbeat` needs a `CapabilityRouter`) — each module registers
its own WordPress hooks in its own constructor/`registerHooks()` call.

**Compatibility:** `Requires at least: 7`, `Tested up to: 7.0`, `Requires PHP: 7.4` — 7.4 because
that's WordPress core's own minimum, actively tested on PHP 8.1–8.4.

### Dual execution path (`core/CapabilityRouter.php`)

```
detectExecutionPath() -> WP7_NATIVE | LEGACY_OUTBOUND
```

`WP7_NATIVE` requires both WordPress 7.0+ *and* `wp_register_ability` actually existing at runtime
(the Abilities API feature can be present in core but still disabled or stripped by a host/
conflicting mu-plugin) — the plugin's own `Requires at least: 7` header already stops WordPress from
activating it below 7.0 at all, so the version check here is defensive belt-and-suspenders, not the
condition that matters day to day. Everything else falls back to `LEGACY_OUTBOUND`.

Both paths delegate execution to the same class, `wp7/ActionExecutor.php` — despite the directory
name, nothing about the 4 currently-implemented actions (`flush_cache`, `clear_transients`,
`activate_plugin`, `deactivate_plugin`) is actually WP7-specific; they're plain, long-standing WP
core calls. The real distinction between the two paths is *discovery* (MCP-invoked vs.
outbound-polling-claimed), never how carefully an action is verified or executed. Every other
whitelisted action returns an honest `not_implemented` result rather than a fragile guess.

### Legacy path (`core/WorkOrderPoller.php`)

Fires on WordPress's `shutdown` hook (not WP-Cron, whose schedule isn't reliably timed) — same
pattern as `core/Heartbeat.php` — gated to once per 60 seconds. Each poll:

1. Refuses to proceed if `KillSwitch::isActive()` or `SafeMode::isActive()`.
2. Claims a work order (`POST /api/sites/:id/work-orders/claim`, signed with the site's own secret).
3. Validates it (`safety/WorkOrderValidator.php` — see below).
4. Executes it via `ActionExecutor`, records the outcome to `SafeMode` (a run of failures is exactly
   the anomaly `SafeMode` exists to catch), and reports the result back
   (`POST /api/work-orders/:id/result`) fire-and-forget. A dropped result report has no retry today
   — a known limitation, not an oversight (there's no "next cycle" for a specific past order the
   way there is for a recurring heartbeat).

### Native path (`wp7/AbilitiesRegistrar.php`, `wp7/MCPEndpoints.php`)

Registers one WP7 Ability per implemented action via `wp_register_ability` (hooked to
`wp_abilities_api_init`), each delegating straight to the shared `ActionExecutor`. Exposes a single
`POST /syntaxwp/v1/mcp/execute` REST route for the control plane to call directly instead of waiting
to be polled.

> **Flagged, not confirmed:** the exact hook name (`wp_abilities_api_init`), `wp_register_ability`'s
> argument shape, and the MCP route's request/response shape are built from the architecture doc's
> description of WP7's Abilities/MCP API, not verified against WP7's real (still-evolving) core
> implementation. Verify both against the actual API before this ships to a real WP7 site. What
> *is* confirmed: the HMAC/replay verification itself, and the ability-name → whitelisted-action
> mapping.

**Security-critical detail:** `MCPEndpoints`'s route was originally gated on a loopback
(`REMOTE_ADDR`) check alone. That's broken on the extremely common deployment shape of nginx
reverse-proxying to PHP-FPM on the same host, where PHP sees `REMOTE_ADDR = 127.0.0.1` for *every*
external request — loopback carries no trust in that topology. Fixed (caught by a background
security review before shipping) by requiring the same HMAC signature + timestamp + nonce
verification every other plugin-originated request in this system uses
(`verifySignedRequest()`), with the loopback check kept only as defense-in-depth on top of it, never
as the sole gate. **Rule for any future endpoint in this plugin: network topology is never a
sufficient authentication mechanism on its own.**

### Request validation (`safety/WorkOrderValidator.php`)

Order: HMAC match → expiry → replay → action whitelist — matching the architecture doc's own
reference implementation (§15.1) exactly.

- **HMAC** — `core/Hmac.php`'s canonicalization (recursively sort object keys, JSON-encode) mirrors
  `packages/shared/src/hmac.ts` field-for-field, pinned to the same golden fixture vectors in both
  languages' test suites.
- **Replay** — the work order's own `id` doubles as its nonce (no separate nonce field on the wire
  schema), tracked in a WP transient with a 600-second TTL.
- **Whitelist** — `safety/ActionWhitelist.php`'s 12 allowed actions. `run_arbitrary_command` is
  deliberately *absent* from this list, as defense-in-depth: even if a signed work order for it
  somehow existed, the plugin's own local whitelist independently refuses to execute it, regardless
  of what the backend policy engine already blocks it from ever issuing.

### Safety controls (`safety/SafeMode.php`, `safety/KillSwitch.php`)

Two independent kill paths, checked before every claim/execute:

- **SafeMode** — local, self-detected. A consecutive-failure counter (threshold 3) trips it; any
  success resets the counter. Deliberately counts consecutive failures, not a time window — a burst
  of failures close together is the actual anomaly signal; occasional failures spread over days are
  normal noise.
- **KillSwitch** — remote-triggered from the SyntaxWP backend. Today this class is only the local
  primitive (an option-backed flag + two setters); the delivery mechanism for the backend to
  actually flip it on a site it can't be pushed to (most likely riding along in a heartbeat
  response) doesn't exist yet — out of scope for the plugin-side task that built this class.

### Watchdog (`mu-watchdog/SyntaxWPWatchdog.php`)

A must-use plugin, deliberately self-contained with zero dependency on the main plugin's Composer
autoloader or any of its classes — MU plugins load before regular plugins in WP's bootstrap
sequence, and if the main plugin's own code is what's broken, this file has to keep working
regardless. Checks every 5 minutes (less frequent than the main plugin's 60s heartbeat — this only
exists to catch the main plugin being *down*) whether `SyntaxWP` the class exists and the plugin is
active; if not, signs and fire-and-forget-reports a `plugin_crashed` event using its own duplicated
(but still fully recursive) HMAC implementation.

### Testing

WP_Mock + PHPUnit + Mockery — mocks WordPress core functions, no live WordPress install required
(`composer test`). A separate `composer test:integration` config/bootstrap exists for
`tests/Integration/LegacyPollingTest.php`, which exercises the real claim → validate → execute →
report round trip against a live local `pnpm dev` API instance and Postgres; it self-skips (not
fails) when either is unreachable.

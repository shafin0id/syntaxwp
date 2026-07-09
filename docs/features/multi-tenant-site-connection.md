# Multi-Tenant Site Connection

## Product Summary

Every WordPress site a customer connects to SyntaxWP gets its own private, isolated record — even
if one customer manages dozens of sites, or an agency manages sites for many different clients.
Connecting a site is a one-time setup step: the dashboard generates a unique secret key for that
site, the customer copies it into the SyntaxWP plugin during install, and from that moment on every
message between that site and SyntaxWP's servers is cryptographically signed with that key. Nobody
— not another customer, not an attacker who compromises a different site — can impersonate that
site or read its data, because the signing key never leaves the customer's own WordPress install
and the server after the moment it's issued.

Once connected, the site checks in automatically every 60 seconds (a "heartbeat") so the dashboard
always shows current WordPress/PHP versions, plugin inventory, and an overall health score, and
reports meaningful events (a plugin was updated, a checkout failed) the moment they happen rather
than the customer having to go looking for them.

## Technical Reference

### Data model

- `orgs` (`packages/db/src/schema/orgs.ts`) — the tenant boundary. `plan` (starter/pro/agency),
  `permission_default` (the default autonomy tier new sites inherit, §9.3).
- `sites` (`packages/db/src/schema/sites.ts`) — one row per connected WordPress install, always
  scoped to exactly one `org_id`. Notable columns: `url`, `staging_url` (the customer's own staging
  environment, not credentials for it — see `SECURITY-AUDIT.md`), `wp_version`, `execution_path`
  (`wp7_native` | `legacy_outbound`, §4.1), `permission_tier`, `woo_enabled`, `last_heartbeat_at`,
  `health_score`, and `site_secret_ciphertext` (never plaintext — see below).

Every repository function that touches `sites` or anything joined through it takes an explicit
`orgId`/`siteId` parameter and filters on it (`packages/db/src/repositories/sites.ts`,
`getSiteByIdForOrg`) — row-level isolation is enforced at the query layer, not left to trust.

### Site secret lifecycle

1. `POST /api/sites` (session-authed, `apps/api/src/routes/sites.ts`) generates a 32-byte random
   secret (`generateSiteSecret()`, `packages/shared/src/site-secret.ts`), encrypts it with
   AES-256-GCM under the server's `SITE_SECRET_ENCRYPTION_KEY`, and stores only the ciphertext.
   Envelope format: `"v1:" + base64(iv[12] + authTag[16] + ciphertext)` — the `v1:` prefix lets a
   future algorithm change dispatch without a schema migration.
2. The **plaintext** secret is returned exactly once, in that same `201` response body — the same
   show-once pattern as an API key. No other endpoint, including `GET /api/sites/:id`, ever
   serializes `site_secret_ciphertext` or a decrypted value (`serializeSite()` always strips it).
   There is no recovery flow if it's lost, only reprovisioning a new site record.
3. The customer configures the plugin with that secret during install. From then on, the plugin
   signs every request it makes to SyntaxWP with it; the server decrypts its stored copy on demand
   to verify each signature (`decryptSiteSecret`, called from `verifySiteAuth`).

### Plugin → API authentication (`verifySiteAuth`, `apps/api/src/auth/site-auth.ts`)

Distinct from `requireSession` (dashboard user, Supabase Auth session token) — the plugin has no
user session, so it proves identity by signing its own request body. Expected shape:
`{ site_id, timestamp, nonce, hmac, ...rest }`. Verification, in order:

1. Structural check — all four required fields present and correctly typed.
2. Replay window — `timestamp` (Unix seconds) must be within ±5 minutes of server time, the same
   window work orders use (§8.2) for consistency across the codebase.
3. Look up the site by `site_id`; unknown site → `401`.
4. Decrypt that site's stored secret, recompute the HMAC over `{ site_id, timestamp, nonce, ...rest }`
   via `canonicalizeForSigning`/`signPayload` (`packages/shared/src/hmac.ts` — the exact same
   canonicalization work orders use, §3.1), compare against the request's `hmac`.
5. Nonce dedup — `recordNonceIfUnused` against the Postgres-backed `site_auth_nonces` table (not
   in-memory: this is a security control that must survive a restart or run correctly behind more
   than one API instance, unlike rate limiting).

Any failure at any step returns `401`, never a `500` — a malformed or undecryptable ciphertext is
an auth failure from the caller's perspective, not a server error.

### Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/sites` | session | Create a site, returns the plaintext secret once |
| `GET /api/sites/:id` | session, org-scoped | Fetch a site's current state (never the secret) |
| `GET /api/sites/:id/stream` | session, org-scoped | SSE stream of live audit-log events (§10.3) |
| `POST /api/sites/:id/heartbeat` | site HMAC | 60s check-in: WP version, execution path, plugin list |
| `POST /api/sites/:id/events` | site HMAC | Plugin-reported lifecycle events → `audit_log` rows |
| `POST /api/sites/:id/work-orders/claim` | site HMAC | Legacy-path work order discovery+claim (§4.1, A5b.1) |

All four site-HMAC-authed endpoints also enforce a per-endpoint-class rate limit
(`apps/api/src/middleware/rate-limit.ts`, tuned in A9.1 against §15.2's spec: heartbeat 6/60s,
events 60/60s, work_claims 12/60s) keyed by `site.id`, so one compromised or malfunctioning site
can't exhaust shared capacity.

### Known limitation

Rate limiting is an in-memory, per-process counter — it will not enforce a correct combined limit
across more than one horizontally-scaled API instance (each gets an independent counter). Accepted
for a single-instance MVP deploy; noted in `BACKEND-DEVELOPMENT-PLAN.md`'s A9.1 as a follow-up if
that changes.

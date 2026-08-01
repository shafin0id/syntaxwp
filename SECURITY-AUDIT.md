# Security Audit — Secrets Handling (Task A9.3)

Audited 2026-07-09 against `syntaxwp-mvp-architecture-v11.md` §15.3's secrets table. Scope: every
`.ts`/`.tsx`/`.php` file tracked by git (excludes `node_modules`, `packages/plugin/vendor`), plus
`.env.example` files. Methodology: targeted greps for logging calls, response serialization,
hardcoded-looking secret literals, and every reference to each secret/env var name below — not a
generic linter pass. Each row states a verdict: **CLEAN** (checked, nothing wrong), **ACCEPTED**
(a real instance exists, but is intentional and low-risk — reasoning given), or **NOT YET
APPLICABLE** (the code path the "never" rule protects against doesn't exist yet, so there's nothing
to audit — noted explicitly rather than claimed as closed).

| Secret | Storage | Never | Verdict |
|---|---|---|---|
| Site HMAC secrets | Supabase, encrypted at rest | Sent to LLM, logged | See below |
| DeepSeek API key | Heroku config var (server env) | In codebase, client-side | CLEAN |
| Gemini API key | Heroku config var (server env) | In codebase, client-side | CLEAN |
| Patchstack API key | Heroku config var (disabled) | Logged | NOT YET APPLICABLE |
| Stripe keys | Heroku config var + Stripe hooks | Client-side | CLEAN |
| Staging credentials | Supabase, encrypted | Sent to LLM | NOT YET APPLICABLE |

## Site HMAC secrets

**Encrypted at rest:** confirmed — `sites.site_secret_ciphertext` (AES-256-GCM,
`packages/shared/src/site-secret.ts`, A2.4). `serializeSite()`
(`apps/api/src/routes/sites.ts:76`) always strips `siteSecretCiphertext` before any response;
the *plaintext* secret is returned exactly once, in `POST /api/sites`'s creation response
(`apps/api/src/routes/sites.ts:108`) — the API-key show-once pattern, by design (A5a.2a). No other
route returns it. Grepped every `console.*`/`error_log`/`var_dump`/`print_r` call in
`apps/api/src`, `packages/db/src`, `packages/shared/src`, and `packages/plugin`'s non-vendor PHP —
none log a raw secret, HMAC, or decrypted value in production code paths.

**Sent to LLM:** not yet applicable — Track B's LLM router (`packages/shared/src/llm.ts`'s
`LLMRequest`) has no implementation yet, so there is no call site that could serialize a secret
into a prompt. [[A9.2's `redactPII`]](./packages/shared/src/pii-redaction.ts) is the contract for
whoever builds that router to call on `LLMRequest.input` first.

**Accepted exception — dev tooling only:** `packages/db/src/seed.ts:34`
(`console.log("dev site_secret:", siteSecret)`) and `apps/api/src/auth/seed-dev-user.ts:36`
(`console.log("dev password:", DEV_PASSWORD)`) print a plaintext secret/password to a local
terminal. Both are one-off CLI scripts run only by a developer against their own local Supabase
instance (`LOCAL-DEVELOPMENT-SETUP.md` §4 documents this as intended — the seed script's entire
job is handing the developer a secret to put in their own `.env`), never invoked in a deployed
environment, and never write to a file or aggregated log sink. Same risk profile as the show-once
API response above, just for local dev instead of a real site. Not treated as a gap.

## DeepSeek / Gemini API keys

Both are declared `optional()` in `apps/api/src/env.ts` (server-side env only) and are not read by
any code yet — Track B hasn't built the LLM router that would consume them. Neither name appears
anywhere under `apps/dashboard` (checked every `.ts`/`.tsx` file and every `NEXT_PUBLIC_*`
reference) or in any client-bundled config. `.env.example` files list them with empty values, never
real keys; no real key value is committed anywhere in git-tracked files.

## Patchstack API key

Not yet applicable — matches the spec's own "(disabled)" annotation. No `PATCHSTACK_API_KEY` (or
similarly named) env var is declared anywhere, not even as an unused optional field. The only
references in the codebase are a data-source enum value (`'patchstack'` in
`packages/db/src/schema/vulnerability-advisories.ts`, describing where a vulnerability advisory
*row* originated) and architecture-doc prose describing a future paid upgrade path — no key, no
client, nothing to leak.

## Stripe keys

`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are declared `optional()` in `apps/api/src/env.ts`
(server-side only) and not read anywhere yet (billing is unbuilt). Every other "Stripe" reference
in the repo is `apps/dashboard` UI copy/mock data (`lib/mock-data.ts`, `app/store/page.tsx`, etc.)
describing WooCommerce payment-gateway *status* to a user — no key material, no `NEXT_PUBLIC_*`
Stripe variable exists anywhere.

## Staging credentials

Not yet applicable — no "staging credentials" storage exists at all yet. `sites.staging_url`
(`packages/db/src/schema/sites.ts`) is a plain, non-secret URL column (the client's own staging
site address), not authentication credentials for it. When staging-environment login credentials
are actually implemented, they should follow the same AES-256-GCM-at-rest pattern
`site_secret_ciphertext` already uses, not a new mechanism.

## General sweep

Grepped every `.ts`/`.php`/`.json` file for hardcoded-looking secret literals (`sk_test_`/`sk_live_`
prefixes, long base64/hex strings assigned directly to a `*_KEY`/`*_SECRET` name) — none found. `git
ls-files` confirms no real `.env` file has ever been committed (only `.env.example` templates, which
`.gitignore` explicitly excepts from the blanket `.env`/`.env.*` ignore rule).

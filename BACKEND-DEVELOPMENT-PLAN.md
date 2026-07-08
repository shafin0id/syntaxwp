# SyntaxWP — Backend Development Plan

Governing specs: `syntaxwp-mvp-architecture-v11.md` (v1.1) + `syntaxwp-features-guide.md`.
`README.md`'s chat-first / Temporal description is treated as **superseded** — the architecture doc
explicitly states it supersedes prior discussions and commits to the no-chat, stepper-card UI and
Graphile Worker (not Temporal). The existing `app/` frontend already matches that decision
(`execution-stepper.tsx`, `health-dial.tsx`, `status-rail.tsx`, incidents/security/performance pages).

Section references like `(§8.2)` point at the architecture doc.

---

## 0. Confirmed Decisions (from clarification round)

| Decision | Answer |
|---|---|
| Repo structure | Single repo, converted to a pnpm workspace monorepo |
| Source of truth | Architecture v1.1 + features guide; README.md superseded |
| Plugin scope | WordPress plugin (PHP) is in scope for this plan |
| Local WordPress site | Deferred — not required for this phase of backend work |
| Local services | Supabase CLI (local Docker stack) for Postgres/Auth/Realtime; Graphile Worker runs against that same local Postgres |

## 0.1 Implementation Assumptions (flagging, not asking — override any of these freely)

These are engineering-detail choices the architecture doc doesn't pin down. None of them affect the
task breakdown below if changed later — call them out if you want something different before Task 1 starts:

- **ORM/migrations:** Drizzle ORM + drizzle-kit for the Postgres schema in §14.1. TS-native, pairs
  well with Hono, works against Supabase Postgres without needing Supabase-specific tooling.
- **Monorepo tooling:** plain `pnpm-workspace.yaml`, no Turborepo/Nx. Nothing here yet justifies
  build-graph caching; add it later if `pnpm dev`/`pnpm build` across apps gets slow.
- **Local R2 substitute:** MinIO via Docker Compose (S3-compatible API, same interface shape as R2)
  rather than a filesystem stub — Docker is already required for Supabase CLI, so this is low
  incremental cost and gives real upload/signed-URL fidelity.
- **Process orchestration locally:** `concurrently` to run dashboard + api + worker with one command;
  PM2 (§16.1) is reserved for the actual deployed container, not local dev.

## 0.2 Target Monorepo Layout (what Task 1 produces)

```
syntaxwp/
├── apps/
│   ├── dashboard/        # existing Next.js app, moved here as-is
│   ├── api/              # Hono API + Graphile Worker (single deployable unit, §16.1)
│   └── probes/           # Cloudflare Worker — uptime probes (§5.2), separate runtime/deploy target
├── packages/
│   ├── shared/            # Zod schemas + TS types: FixIntent, IncidentDiagnosis, WorkOrder, LLMRequest (§7.4, §8.2)
│   ├── db/                # Drizzle schema + migrations for §14.1 tables, seed scripts
│   └── plugin/            # WordPress plugin, PHP (§4.2) — syntaxwp-plugin/ tree
├── pnpm-workspace.yaml
├── package.json           # root scripts: dev, build, lint, typecheck
├── BACKEND-DEVELOPMENT-PLAN.md
└── LOCAL-DEVELOPMENT-SETUP.md
```

## 0.3 How the Two Tracks Are Split

**Track A — Platform, Security & Execution Substrate.** Everything that makes P4 ("Deterministic
Gatekeeper, AI Inside") true: the data model, the HMAC work order engine, the policy engine, the
WordPress plugin, snapshots/revert, audit log. This is the side that must be correct and boring —
no AI calls happen here.

**Track B — Intelligence, Detection & Verification.** Everything that decides *what* to do and
*proves* it worked: detection ingestion, the LLM router, the four-tier diagnostic stack, Playwright
verification, WooCommerce protection, vulnerability feeds, performance/analytics, and wiring real
data into the existing dashboard pages.

Both tracks branch from Task 1 (foundation, sequential, not parallelizable — it's the shared
scaffold). After that, Track B can build against the `packages/shared` contracts (Zod schemas,
WorkOrder types) as soon as they exist in Task 1, without waiting for Track A's policy engine or
plugin to be fully implemented — stub the executor, build the real thing later. Explicit
cross-track dependencies are called out inline below.

**Revised after review:** the original split understated two real dependencies — B2's ingestion
endpoints need site-authenticated API access, and Task A5 (which provides that) was sequenced 4th
in Track A, not 1st. Fixed by (a) splitting A5 into A5a (core auth + endpoints, moved right after
A2) and A5b (work-order/streaming, stays after A3), and (b) adding a short joint pre-step (below)
that defines stub interfaces for the pieces that stay genuinely coupled, so Track B never blocks
waiting on Track A's real implementation.

**File ownership in `apps/api`** (avoids merge conflicts once both devs are touching the same app):
Track A owns `src/auth/*`, `src/middleware/rate-limit.ts`, `src/routes/sites.ts`. Track B owns
`src/routes/ingestion.ts`, `src/routes/probes.ts`. Both are mounted separately in `app.ts`;
swapping Track B's stub auth for Track A's real middleware later is a one-import change.

---

## Task 1 — Backend Foundation *(sequential prerequisite, blocks both tracks)* ✅ Done

- [x] **1.1** Convert repo to pnpm workspace monorepo. Add `pnpm-workspace.yaml`. Move `app/`,
  `components/`, `lib/`, `public/`, Next config files into `apps/dashboard/`. Preserve git history via
  `git mv` where possible. Root-level shared `tsconfig.base.json` + shared ESLint config.
- [x] **1.2** Scaffold `apps/api`: Hono entrypoint (`src/index.ts`), `GET /healthz`, env loading with
  a Zod-validated env schema per app (fail fast on missing var, not silent `undefined`).
- [x] **1.3** Scaffold `packages/shared`: port `FixIntentSchema`, `IncidentDiagnosisSchema`,
  `WorkOrder` interface + zod schema, `LLMRequest` types verbatim from §7.4 / §8.2. Published as
  workspace package `@syntaxwp/shared`, consumed by `apps/api` and (for typed SSE payloads) by
  `apps/dashboard`.
- [x] **1.4** Scaffold `packages/db`: Drizzle schema matching every table in §14.1 (`orgs`, `sites`,
  `plugin_inventory`, `incidents`, `work_orders`, `snapshots`, `audit_log`,
  `vulnerability_advisories`, `performance_snapshots`) + migration generation wired to local Supabase
  Postgres.
- [x] **1.5** Local Supabase stack: `supabase/config.toml`, `supabase start` boots Postgres+Auth+
  Realtime in Docker. Seed script creates one dev org + one dev site with a generated `site_secret`.
- [x] **1.6** Graphile Worker inside `apps/api`: worker entrypoint, empty task registry (placeholders
  for `dead_mans_switch_fire`, vuln sync, heartbeat-drift check), confirmed running against local
  Postgres per P5.
- [x] **1.7** Minimal auth: Supabase Auth session between `apps/dashboard` and `apps/api`, one seeded
  dev user.
- [x] **1.8** Root dev orchestration: `pnpm dev` runs dashboard + api + worker concurrently; documented
  way to confirm all three are up.
- [x] **1.9** CI skeleton: lint + typecheck GitHub Actions workflow (no deploy yet — deploy pipeline
  is out of scope for this plan).
- [x] **1.10** MinIO via Docker Compose as local R2 substitute, with a small storage-client wrapper in
  `packages/shared` (`putObject`/`getSignedUrl`) that both local MinIO and real R2 satisfy.

**Definition of done — verified 2026-07-06:** `pnpm install && pnpm dev` boots dashboard (3000) +
api (4000) + worker (`listening for jobs` confirmed in log). `curl localhost:4000/healthz` → `200
{"status":"ok"}`. Dashboard's `/dev/api-check` page fetches `GET /api/dev/site-health` from the API
and renders the returned health score — dashboard↔api wire confirmed live, including CORS (see
deviations below). `requireSession` middleware verified end-to-end: 401 with no token, 200 with a
real Supabase Auth session token for the seeded dev user. Graphile Worker confirmed to have created
its `graphile_worker` schema against local Postgres alongside all 9 Drizzle-managed tables.

**Deviations found during implementation (fixed, noted for whoever picks up Track A/B next):**
- `drizzle-kit generate`'s own CLI can't resolve this project's NodeNext-style `.js`-suffixed
  relative imports across schema files (it does plain CJS `require`, not full ESM resolution). Fixed
  by running it through `tsx` instead: `packages/db`'s `generate` script is
  `tsx ./node_modules/drizzle-kit/bin.cjs generate`. Transparent to anyone just running
  `pnpm --filter @syntaxwp/db generate` — only matters if you're editing that script.
- `hono/cors` middleware was missing from `apps/api/src/app.ts` — `curl` doesn't enforce CORS so this
  wasn't caught until testing the dashboard's actual browser fetch. Added `cors({ origin:
  "http://localhost:3000" })`, hardcoded to the local dashboard origin for now (Task A5 will need to
  make this configurable once a real deployed dashboard origin exists).
- `apps/dashboard` has pre-existing TypeScript errors (masked today by `typescript.ignoreBuildErrors:
  true` in `next.config.mjs`) and no ESLint config at all — both predate the monorepo conversion,
  neither is fixed by this task. CI's typecheck step only hard-gates `packages/db`, `packages/shared`,
  `apps/api`; the dashboard's typecheck and all of lint run `continue-on-error: true` until someone
  deliberately fixes that debt (not scoped to any task in this plan yet — worth a follow-up task if
  you want it gated).
- `pnpm-workspace.yaml`'s `allowBuilds`/`onlyBuiltDependencies` needed real values (`sharp`, `msw`,
  `esbuild` set to `true`) — pnpm 11 blocks native postinstall scripts by default and had written
  placeholder stub values that would otherwise silently no-op those installs.
- `pnpm.overrides` in `package.json` is no longer read by pnpm 11 — moved to `overrides:` directly in
  `pnpm-workspace.yaml`.

---

## Pre-Step — Cross-Track Contracts *(joint, ~30–60 min, do together before splitting into tracks)*

Both tracks build against these stub interfaces starting immediately instead of waiting for the
real implementation. Swapping a stub for the real thing later is a one-line change, not a rewrite —
same pattern already used for B6.2's mocked ephemeral container below.

- [ ] **C1** Site HMAC verify function signature (e.g. `verifySiteAuth(req): { valid: boolean, siteId?: string }`)
  — stub always returns `valid: true`; Track A implements the real check in A5a.1.
- [ ] **C2** `PolicyDecision` interface (`allow | ask | block`) in `packages/shared` — stub always
  returns `allow`; Track A implements the real logic in A3.3.
- [ ] **C3** `HealthCheckBridge` request/response contract (params + JSON shape) — Track B mocks the
  HTTP response for B5; Track A implements the real PHP bridge in A6.1.

---

## Track A — Platform, Security & Execution Substrate

**Sequence:** A2 → A5a → A3 → A4 → A5b → A6 → A7 → A8 → A9. A5a is pulled forward (right after A2,
ahead of A3/A4) because Track B's B2 depends on it for site-authenticated ingestion — see the
"Revised after review" note above.

### Task A2 — Data Layer & Multi-Tenancy ✅ Done
- [x] A2.1 CRUD repositories for `orgs`/`sites` (§14.1).
- [x] A2.2 Row-level isolation: every query scoped by `site_id`/`org_id` (§14.2).
- [x] A2.3 Postgres RLS policy making `audit_log` append-only (no UPDATE/DELETE, enforced at the DB
  level, not just app level) (§14.2).
- [x] A2.4 Site secret generation + encrypted-at-rest storage (§15.3).

**Definition of done — verified 2026-07-09:** `packages/db/src/repositories/{orgs,sites,audit-log}.ts`
scope every query by `orgId`/`siteId` except the two lookups that structurally can't (org creation;
`getSiteById` for site-HMAC auth resolution, documented inline). `audit_log` append-only is enforced by
a `BEFORE UPDATE OR DELETE` trigger (migration `0001_audit_log_append_only.sql`) — RLS alone was
verified insufficient since local/deployed `DATABASE_URL` connects as the Postgres superuser, which
bypasses RLS unconditionally; RLS+FORCE is layered on as defense-in-depth for a future non-superuser
role. `audit-log.test.ts` proves rejection via both raw SQL and the Drizzle query builder — 5/5 passing
against local Supabase Postgres. `sites.site_secret_ciphertext` stores an AES-256-GCM envelope
(`packages/shared/src/site-secret.ts`), keyed by `SITE_SECRET_ENCRYPTION_KEY`; `site-secret.test.ts`
covers round-trip, IV uniqueness, wrong-key rejection, and key-loading validation — 6/6 passing. Full
local cycle verified: `supabase start` → `pnpm --filter @syntaxwp/db migrate` → `seed` → `test`, all
green. Deferred (flagged, not blocking): introducing a dedicated non-superuser `syntaxwp_app` DB role
for true least-privilege RLS enforcement — pre-production follow-up, see A2.3's migration comment.

### Task A5a — Hono API Surface: Core & Auth *(do this right after A2 — Track B's B2 depends on it)*
- [ ] A5a.1 Dual auth model: plugin-origin requests authenticated by site HMAC (replaces C1 stub),
  dashboard-origin requests authenticated by user session.
- [ ] A5a.2 Core endpoints: `POST /api/sites`, `GET /api/sites/:id`, `POST /api/sites/:id/heartbeat`,
  `POST /api/sites/:id/events`.
- [ ] A5a.3 Rate limiting middleware for the heartbeat/events/probe endpoint classes (§15.2;
  work_claims class added in A5b).

### Task A3 — HMAC Work Order Engine & Policy Engine
- [ ] A3.1 `WorkOrder` issuance: nonce, `issued_at`/`expires_at` (5 min window), HMAC-SHA256 signing
  (§8.2).
- [ ] A3.2 Graphile Worker job to expire/garbage-collect stale unclaimed work orders.
- [ ] A3.3 Policy engine: `policyDecision()`, `ACTION_RISK_MAP`, allow/ask/block logic (§9.3),
  replaces the C2 stub. Unit tests covering every `(action, tier)` combination in the map, including
  the permanently blocked `run_arbitrary_command`.
- [ ] A3.4 API endpoints for user approval flow (approve/decline a pending "ask" work order).

### Task A4 — Dead Man's Switch & Snapshot/Revert
- [ ] A4.1 `armDeadMansSwitch` / `disarmDeadMansSwitch` as Graphile Worker jobs (§9.2).
- [ ] A4.2 Pre-action micro-snapshot capture (active plugins, options checksum, file checksums) → R2
  (MinIO locally) + `snapshots` table row.
- [ ] A4.3 Revert executor: restore from snapshot, confirm restored via health probe.
- [ ] A4.4 30-day snapshot retention/cleanup job (§14.2).

### Task A5b — Hono API Surface: Work Orders & Streaming *(after A3 — needs the WorkOrder engine)*
- [ ] A5b.1 Work-order claim endpoint.
- [ ] A5b.2 `GET /api/sites/:id/stream` (SSE, §10.3).
- [ ] A5b.3 Rate limiting for the work_claims endpoint class (§15.2).

### Task A6 — WordPress Plugin: Core & Safety (`packages/plugin`)
- [ ] A6.1 `core/`: `Heartbeat.php`, `EventQueue.php`, `ErrorCapture.php`, `WorkOrderPoller.php`,
  `CapabilityRouter.php` (§4.2).
- [ ] A6.2 `safety/`: `WorkOrderValidator.php` (HMAC + expiry + nonce + whitelist checks, §15.1),
  `ActionWhitelist.php` (12 permitted actions, §8.2/§9.3), `SafeMode.php`, `KillSwitch.php`.
- [ ] A6.3 `mu-watchdog/SyntaxWPWatchdog.php` (MU plugin, last-resort heartbeat/restart).
  Plugin test harness (PHPUnit or `wp-env`) with mocked HTTP calls to a local `apps/api` instance —
  no live WordPress site required for this.
- [ ] A6.4 Resource budget enforcement checks (§4.4): server time added, memory footprint, zero
  autoload DB writes, network calls only on `shutdown`/WP-Cron.

### Task A7 — WordPress Plugin: Dual Execution Path
- [ ] A7.1 `wp7/`: `AbilitiesRegistrar.php`, `MCPEndpoints.php` (localhost-only), `ActionExecutor.php`
  (§4.1, §4.2).
- [ ] A7.2 Legacy outbound polling path completion + integration test against Task A5 endpoints.
- [ ] A7.3 `CapabilityRouter.php` version-detection logic: routes to WP7 native path vs. legacy path.

### Task A8 — Audit Log Wiring & Immutability
- [ ] A8.1 Every mutating action across A3–A7 writes an `audit_log` row (actor, summary in plain
  English, evidence).
- [ ] A8.2 Verify append-only enforcement with an automated test that attempts UPDATE/DELETE and
  expects rejection.

### Task A9 — Security Hardening Pass
- [ ] A9.1 Rate limit tuning against real traffic shapes from Track B's synthetic checks.
- [ ] A9.2 PII redaction utility (§14.2) applied at the API boundary *before* anything reaches
  Track B's LLM calls — no email, name, IP, or order detail ever serialized into an LLM prompt.
- [ ] A9.3 Secrets audit against the §15.3 table — confirm nothing listed as "never" (LLM, logs,
  client-side) actually ends up there.

---

## Track B — Intelligence, Detection & Verification

### Task B2 — Detection Ingestion Endpoints & Dedup
*Depends on:* Task 1 (shared contracts + `packages/db` client) and the C1 auth stub. Start against
the C1 stub immediately; swap to real HMAC verification once A5a.1 lands. Write directly against the
`packages/db` Drizzle client for incident rows — no need to wait on A2's org/site repo layer, just
scope every read/write by `site_id`/`org_id` by hand until A2.2/A2.3 formalize it as RLS.
- [ ] B2.1 `POST /api/probes/anomaly`, PHP-fatal ingestion endpoint, heartbeat-drift Graphile job
  (§5.1, sources 1–4).
- [ ] B2.2 WooCommerce failed-checkout ingestion (source 5).
- [ ] B2.3 Incident fingerprinting + `INSERT ... ON CONFLICT DO NOTHING` dedup (§5.3).

### Task B3 — Cloudflare Worker: Uptime Probes (`apps/probes`)
- [ ] B3.1 Wrangler project scaffold, scheduled probe handler (§5.2): TTFB, WSOD detection
  (200 + body < 500 chars), 5xx detection.
- [ ] B3.2 KV-backed site list (stub for local dev — real KV sync is a later deploy concern).
- [ ] B3.3 `wrangler dev` verified locally posting anomalies to local `apps/api`.

### Task B4 — Known-Signature Matcher & LLM Router
- [ ] B4.1 `KNOWN_SIGNATURES` regex table (§7.5) — zero-LLM-cost fast path.
- [ ] B4.2 `routeLLM()` / `selectModel()` (§7.2), provider clients for Gemini 2.5 Flash-Lite and
  DeepSeek V4 Pro/Flash.
- [ ] B4.3 Prompt-injection-safe prompt builder — trusted/untrusted content separation (§7.3).
- [ ] B4.4 All LLM outputs validated against `packages/shared` Zod schemas before use; malformed
  output triggers a retry, not a crash.

### Task B5 — Diagnostic Method Stack: Tier 1 (Health Check Troubleshooting)
*Depends on:* the C3 contract to start (mock the `HealthCheckBridge` HTTP response and build
`binarySearchPluginConflict()`/the Playwright runner against it). Real integration with Task A6's
actual `HealthCheckBridge.php` happens once A6.1 lands — coordinate with Track A before wiring that
swap in.
- [ ] B5.1 `HealthCheckBridge.php` — activates Health Check plugin via WP-CLI, session-isolated.
- [ ] B5.2 `binarySearchPluginConflict()` (§6, Method 1) — O(log n) plugin conflict isolation.
- [ ] B5.3 Local Playwright runner (concurrency = 1 per §3.3), admin-session navigation to failing URL.

### Task B6 — Diagnostic Method Stack: Tiers 2–4
- [ ] B6.1 Tier 2 — staging promotion flow: fix applied to client staging plugin instance
  (staging-scoped HMAC key), visual + functional verification, promote-on-pass / re-diagnose-on-fail
  (max 3 loops).
- [ ] B6.2 Tier 3 — Surgical Clone Manifest + ephemeral container flow. **Local dev note:** the real
  ephemeral-VM spin-up is a deploy-time concern; for local dev, mock the container lifecycle behind
  the same interface so the state machine (Task B7) can be tested end-to-end without real Docker
  spin-up per incident.
- [ ] B6.3 Tier 4 — production-with-consent flow: consent card data contract, low-risk-only gate,
  ties into Task A4's micro-snapshot.

### Task B7 — Fix Pipeline State Machine & Verification
*Depends on:* the C2 `PolicyDecision` stub to start — build and test the state machine's
promote/revert branching against the always-`allow` stub. Real integration with Task A3's policy
engine and Task A4's dead man's switch/snapshot executor happens once those land.
- [ ] B7.1 §8.1 state machine as a Graphile Worker job chain (tier selection → fix apply → verify →
  promote/revert).
- [ ] B7.2 `visualRegression()` with `pngjs`/`pixelmatch`, 0.05% diff threshold (§9.1).
- [ ] B7.3 Functional checks: page load, console error detection, WooCommerce synthetic checkout hook
  (ties into Task B8).

### Task B8 — WooCommerce Protection Suite
- [ ] B8.1 `syntheticCheckoutCheck()` Playwright job, runs every 10 min (§11.1).
- [ ] B8.2 `WooCommerceHooks.php` event hooks — coordinate with Track A on the plugin PR (§11.2).
- [ ] B8.3 `estimateRevenueLoss()` — peak-hour multiplier, confidence based on data point count (§11.3).

### Task B9 — Vulnerability Feed & Integrity Scanner
- [ ] B9.1 OSV + GitHub Advisory sync Graphile job, every 6h (§12.1).
- [ ] B9.2 Local checksum verification bridge against wordpress.org APIs (§12.1 Layer 2).
- [ ] B9.3 `MicroSnapshot.php` SHA-256 file manifest baseline + heartbeat-time comparison (§12.2).
- [ ] B9.4 SSL & domain watch (§12.3) — daily Cloudflare Worker job, WHOIS free-tier API.

### Task B10 — Performance & Analytics
- [ ] B10.1 Core Web Vitals fetch via Chrome UX Report API (§13.1).
- [ ] B10.2 TTFB speed-regression alert job (§13.2).
- [ ] B10.3 Plugin pageview tracker endpoint, GDPR-clean payload (§13.3).
- [ ] B10.4 `calculateHealthScore()` (§10.5) surfaced via API for the dashboard sidebar.

### Task B11 — Dashboard-Facing SSE & Read APIs
- [ ] B11.1 Wire real data into `apps/dashboard`'s existing pages (`incidents`, `security`,
  `performance`, `updates`, `restore-points`, `reports`, `store`), replacing `lib/mock-data.ts`.
- [ ] B11.2 SSE-driven execution stepper live updates (§10.2/§10.3) against `components/shared/execution-stepper.tsx`.
- [ ] B11.3 Persistent status sidebar wired to real health score + restore points (§10.4).

---

## Integration & Hardening (after both tracks converge)

- [ ] **I1** — End-to-end incident simulation: fake PHP fatal → detection → diagnosis → staging fix →
  verification → production promotion → audit log entry, run against local stack only.
- [ ] **I2** — Full security pass across the assembled pipeline: confirm no PII/content ever reaches
  an LLM call, confirm HMAC replay protection actually rejects a replayed nonce, confirm blocked
  actions are unreachable regardless of permission tier.
- [ ] **I3** — Deployment prep: Dockerfile + PM2 ecosystem config for the `apps/api` container
  (§16.1), left for a separate deploy-focused pass — explicitly out of scope for this plan.

---

## Explicit Non-Goals of This Plan

- Local WordPress test site setup (deferred per your answer — plugin is tested via mocked HTTP/PHPUnit
  for now).
- Production deployment/CI-CD pipeline (§16.3) — infra deploy is a separate effort.
- Reconciling or rewriting `README.md` — flagging it as superseded is as far as this plan goes;
  decide separately whether to update or delete it.

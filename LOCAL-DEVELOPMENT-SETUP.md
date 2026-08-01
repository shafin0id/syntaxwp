# SyntaxWP — Local Development Setup

Task 1 (Backend Foundation) from `BACKEND-DEVELOPMENT-PLAN.md` has landed — everything in §1–§6, §8,
§10 below is real and verified against this repo, not aspirational. `apps/dashboard`, `apps/api`,
`packages/shared`, and `packages/db` exist. `apps/probes` (Cloudflare Worker, Task B3) and
`packages/plugin` (WordPress plugin, Task A6) do **not** exist yet — §7 and §9 describe how they'll
work once those tracks land, and are marked accordingly.

Not covered here (deliberately, per the backend plan's non-goals): a local WordPress test site for
the plugin, and any cloud/production deployment steps.

---

## 1. Prerequisites

Install these once, in this order:

| Tool | Version | Check | Install |
|---|---|---|---|
| Node.js | 22.13+ (pnpm 11 requires it; tested on 22.22.2) | `node -v` | `brew install node@22` (or nvm) |
| pnpm | 11+ (tested on 11.10.0) | `pnpm -v` | `corepack enable && corepack prepare pnpm@latest --activate` |
| Docker Desktop | latest | `docker info` runs without error | https://www.docker.com/products/docker-desktop |
| Supabase CLI | latest (tested on 2.109.0) | `supabase --version` | `brew install supabase/tap/supabase` |
| Git | any recent | `git --version` | (already present on macOS) |

Docker Desktop must be **running** before you start Supabase or MinIO — both are Docker-backed.

If you're going to touch `apps/probes` once it exists (Cloudflare Worker probes, Task B3), also
install:

| Tool | Check | Install |
|---|---|---|
| Wrangler CLI | `pnpm dlx wrangler --version` | no global install needed — used via `pnpm dlx` |

---

## 2. Clone & Install

```bash
git clone <repo-url> syntaxwp
cd syntaxwp
pnpm install
```

This installs dependencies for every workspace package that exists today (`apps/dashboard`,
`apps/api`, `packages/shared`, `packages/db`) in one pass. If you see pnpm warn about `allowBuilds`
placeholders or refuse to run a package's install script, see the Troubleshooting section (§11) —
`pnpm-workspace.yaml` already has real values checked in, but a newly-added native dependency down
the line can reintroduce that prompt.

---

## 3. Environment Variables

Each app/package has its own env file, never committed. Copy the example files — real values for
the Supabase ones come from `supabase start` in §4, so do this after §4, then come back and fill
them in:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env.local
cp packages/db/.env.example packages/db/.env
```

### `apps/api/.env`

```bash
# Local Postgres, from `supabase start` — see §4
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
PORT=4000

# Supabase Auth (local) — ANON_KEY/SERVICE_ROLE_KEY printed by `supabase start`
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Local object storage (MinIO, see §5) — NOT real Cloudflare R2 credentials
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin
R2_BUCKET_NAME=syntaxwp-artifacts-dev
R2_ENDPOINT=http://localhost:9000

# Shared secret the (future) local Cloudflare Worker probe uses to call this API
CF_WORKER_SECRET=dev-local-secret-change-me

# AES-256 key (base64, 32 raw bytes) encrypting sites.site_secret_ciphertext at
# rest (Task A2.4) — generate your own, and use the SAME value here and in
# packages/db/.env (the seed script encrypts with it, apps/api decrypts with it):
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
SITE_SECRET_ENCRYPTION_KEY=

# Reserved for Track B (LLM router) / billing — optional, nothing reads these yet.
# See §3.1 for how to get free-tier keys once you're on a task that needs them.
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
RESEND_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

`apps/api` fails fast at startup (a clear Zod error, not a silent `undefined`) if `DATABASE_URL`,
`SUPABASE_*`, `R2_*`, `CF_WORKER_SECRET`, or `SITE_SECRET_ENCRYPTION_KEY` are missing — the
LLM/billing keys are genuinely optional right now since no task reads them yet.

### `apps/dashboard/.env.local`

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### `packages/db/.env`

Drizzle's CLI (`generate`/`migrate`) and the seed script run standalone, outside `apps/api`, so they
load their own env file:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Must match apps/api's value above — the seed script encrypts the dev
# site_secret with this key (Task A2.4).
SITE_SECRET_ENCRYPTION_KEY=
```

### `apps/probes/.dev.vars` (Wrangler local dev vars — once `apps/probes` exists, Task B3)

```bash
API_URL=http://localhost:4000
PROBE_SECRET=dev-local-secret-change-me
```

> `CF_WORKER_SECRET` (api side) and `PROBE_SECRET` (probe side) must match — that's the shared
> secret the probe uses to authenticate anomaly reports.

### 3.1 Getting Dev/Free-Tier API Keys

None of these need a paid plan for local development:

- **DeepSeek** — sign up at platform.deepseek.com, create an API key. Small dev budget (a few
  cents) is enough; §7.1 usage during local testing is negligible.
- **Gemini** — create a key at Google AI Studio (aistudio.google.com/app/apikey). Free tier covers
  1,500 requests/day, more than enough for local dev.
- **Resend** — sign up at resend.com, use the sandbox/test API key. Free tier: 3,000 emails/mo.
- **Stripe** — use your Stripe account's **test mode** secret key (`sk_test_...`) and a webhook
  secret from `stripe listen --forward-to localhost:4000/api/webhooks/stripe` (requires the Stripe
  CLI — `brew install stripe/stripe-cli/stripe` — only needed if you're working on billing).

You do **not** need a Cloudflare account, a Supabase cloud project, or real R2 credentials for local
development — all of those are emulated locally per §4 and §5.

---

## 4. Local Postgres, Auth & Realtime (Supabase CLI)

The whole Postgres + Auth + Realtime stack runs in Docker via the Supabase CLI — no cloud project
needed.

```bash
supabase start
```

First run pulls several Docker images and takes a few minutes. Once it's up, it prints local
service URLs and keys as JSON, including:

- **API_URL:** `http://127.0.0.1:54321`
- **DB_URL:** `postgresql://postgres:postgres@127.0.0.1:54322/postgres` — this is your `DATABASE_URL`
- **Studio:** `http://127.0.0.1:54323` — a web UI for browsing/editing local tables
- **ANON_KEY** / **SERVICE_ROLE_KEY** — copy these into `apps/api/.env` (`SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`) and `apps/dashboard/.env.local` (`NEXT_PUBLIC_SUPABASE_ANON_KEY` gets
  the anon key — never put the service role key in a `NEXT_PUBLIC_*` var)

Lost the output? Run `supabase status` again any time to reprint it.

Apply the schema and seed dev data:

```bash
pnpm --filter @syntaxwp/db migrate   # runs Drizzle migrations against local Postgres
pnpm --filter @syntaxwp/db seed      # creates one dev org + one dev site, prints its site_secret
pnpm --filter @syntaxwp/api seed:user # creates one dev Supabase Auth user (dev@syntaxwp.local)
```

To fully reset local data (drops and recreates the local DB, reruns migrations):

```bash
supabase db reset
```

To stop the local stack when you're done for the day:

```bash
supabase stop
```

---

## 5. Local Object Storage (MinIO, substitutes Cloudflare R2)

MinIO is an S3-compatible server, run via Docker Compose, standing in for R2 locally so upload/
signed-URL code paths behave the same as production without needing real Cloudflare credentials.

A `docker-compose.yml` at the repo root defines the `minio` service. Start it:

```bash
docker compose up -d minio
```

MinIO console: `http://localhost:9001` (login `minioadmin` / `minioadmin` — dev-only credentials,
never used in any real environment). Create the `syntaxwp-artifacts-dev` bucket once via the console,
or via `mc mb` if you have the MinIO client installed — nothing creates it automatically yet (no
task has actually written a snapshot/screenshot to storage yet, so this hasn't been needed in
practice; whichever Track A/B task first uploads something should add bucket auto-creation to its
own setup path rather than relying on this doc).

---

## 6. Running the Full Stack

With Docker services up (§4 and §5) and env files filled in (§3):

```bash
pnpm dev
```

This runs, concurrently, in one terminal with prefixed/colored output:

- `apps/dashboard` — Next.js dev server on **<http://localhost:3000>**
- `apps/api` — Hono API on **<http://localhost:4000>**
- `apps/api` worker process — Graphile Worker, logs `listening for jobs` when ready

Confirm everything is wired correctly:

```bash
curl http://localhost:4000/healthz
# → {"status":"ok"}

open http://localhost:3000/dev/api-check
# → "API reachable — healthScore: 87"
```

`/dev/api-check` is a throwaway page (`apps/dashboard/app/dev/api-check/page.tsx`) that exists only
to prove the dashboard↔api wire and CORS are both working — it's not part of the product surface.
The real dashboard pages (`/incidents`, `/security`, etc.) still run on `lib/mock-data.ts` until
Task B11 wires them to live API data; don't expect the sidebar health score to be real yet.

To exercise the session-auth middleware (`requireSession`) directly:

```bash
# get a session token for the seeded dev user (dev@syntaxwp.local / syntaxwp-dev-password)
TOKEN=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"dev@syntaxwp.local","password":"syntaxwp-dev-password"}' \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

curl http://localhost:4000/api/dev/whoami                              # → 401, no token
curl http://localhost:4000/api/dev/whoami -H "Authorization: Bearer $TOKEN"  # → 200, user JSON
```

If you'd rather run each process in its own terminal (useful for reading logs separately or
attaching a debugger):

```bash
pnpm --filter @syntaxwp/dashboard dev
pnpm --filter @syntaxwp/api dev
pnpm --filter @syntaxwp/api worker
```

### 6.1 Custom Local Domains + HTTPS (optional)

By default the dashboard/API are only reachable on `localhost:3000`/`localhost:4000`. If you want
`https://app.syntaxwp.test` and `https://api.syntaxwp.test` instead — e.g. to match a production-like
origin, or to test cookie/CORS behavior that depends on a real domain — a small Node-only proxy
(`scripts/https-proxy.mjs`) handles it. It doesn't use Laravel Valet or WP Engine's Local app; no
extra system tool required beyond what's already a `devDependency` (`devcert`, `http-proxy`).

**Port 443 has exactly one owner at a time.** If you also run Valet or WP Engine's **Local** app for
other WordPress sites, one of them is very likely already bound to `:443` system-wide — check with
`lsof -iTCP:443 -sTCP:LISTEN`. If so, quit/stop it before `pnpm dev:https` (Local: quit the app
entirely from its menu, there's no CLI toggle; Valet: `valet stop`), and restart it after. Only one
of "this project's proxy" or "your other local sites" can serve `:443` at any given moment.

One-time setup:

```bash
# 1. Map the two hostnames to localhost. Uses a leading newline + `tee -a` rather than a plain
#    `echo ... >> /etc/hosts` — if the file doesn't already end in a newline (common when Valet/Local
#    manage entries), a plain append lands on the same line as the last existing entry and silently
#    fails to resolve.
printf '\n127.0.0.1 app.syntaxwp.test\n127.0.0.1 api.syntaxwp.test\n' | sudo tee -a /etc/hosts >/dev/null

# 2. Point the dashboard/api at the new origins
# apps/dashboard/.env.local: NEXT_PUBLIC_API_URL=https://api.syntaxwp.test
# apps/api/.env:             DASHBOARD_ORIGIN=https://app.syntaxwp.test
```

Then, with `pnpm dev` already running and port 443 free (see above), start the proxy in its own
terminal:

```bash
pnpm dev:https
```

First run pops a macOS Keychain dialog — `devcert` is generating and trusting a local CA so the
browser sees a real, trusted cert (no click-through warning). Accept it once; it's cached and
trusted for every future run. The proxy then binds `:443` (root required, hence `sudo` inside the
script) and forwards by hostname:

- `https://app.syntaxwp.test` → `127.0.0.1:3000` (dashboard, including HMR/WebSocket upgrades)
- `https://api.syntaxwp.test` → `127.0.0.1:4000` (api)

This is purely a local convenience layer — plain `http://localhost:3000`/`:4000` keep working
unchanged whether or not the proxy is running.

---

## 7. Running the Cloudflare Worker Probes Locally *(not built yet — Task B3)*

`apps/probes` doesn't exist in this repo yet. This section describes how it's expected to work once
Task B3 lands — treat it as a spec for that task, not as something you can run today.

In a separate terminal:

```bash
cd apps/probes
pnpm dlx wrangler dev
```

This runs the uptime-probe Worker locally using `.dev.vars` (§3). It won't run on a real cron
schedule locally — trigger a probe manually via the local Wrangler dev URL it prints, or use
Wrangler's scheduled-event test endpoint. Anomalies it detects post to your local `apps/api`
(`API_URL=http://localhost:4000`), which should show up as an incident in the dashboard.

---

## 8. Playwright (Diagnostic & Verification Runner) *(not built yet — Task B5)*

Playwright isn't a dependency of `apps/api` yet — this section describes how it's expected to work
once Task B5 (Tier 1 diagnostic — Health Check binary search) adds it, not something you can run
today.

Install browser binaries once (first time only, or after a Playwright version bump):

```bash
pnpm --filter @syntaxwp/api exec playwright install --with-deps
```

The architecture caps Playwright concurrency at 1 (§3.3) to fit the production container's memory
budget — the local runner respects the same setting so behavior matches production. For debugging a
specific diagnostic flow, run it headed instead of headless:

```bash
PWDEBUG=1 pnpm --filter @syntaxwp/api test:playwright
```

---

## 9. WordPress Plugin (`packages/plugin`) *(not built yet — Task A6)*

`packages/plugin` doesn't exist in this repo yet. Once Task A6 lands: plugin development for that
phase does **not** require a live WordPress site — it's tested with PHPUnit / `wp-env`-style unit
tests that mock HTTP calls to your local `apps/api` (see Task A6 in `BACKEND-DEVELOPMENT-PLAN.md`).
Run its test suite with:

```bash
pnpm --filter @syntaxwp/plugin test
```

Wiring up a real local WordPress site (e.g. via Laravel Valet, since that's already your local dev
setup for other sites) to install and exercise the plugin end-to-end is explicitly deferred — it's
called out as a non-goal in the backend plan and isn't covered here.

---

## 10. Common Workflows

```bash
# Add a new DB migration after editing packages/db/schema.ts
pnpm --filter @syntaxwp/db generate   # generates a new Drizzle migration file
pnpm --filter @syntaxwp/db migrate    # applies it locally

# Typecheck / lint everything
pnpm typecheck   # apps/dashboard currently fails here — pre-existing, see BACKEND-DEVELOPMENT-PLAN.md
pnpm lint        # apps/dashboard has no ESLint config yet — same pre-existing gap

# Run all tests
pnpm test

# Add a new Graphile Worker job
# 1. add the task file under apps/api/src/worker/tasks/
# 2. register it in the task registry (apps/api/src/worker/tasks/index.ts)
# 3. restart `pnpm --filter @syntaxwp/api worker`
```

---

## 11. Troubleshooting

- **`supabase start` fails / hangs** — confirm Docker Desktop is actually running
  (`docker info`), and that ports 54321–54323 aren't already bound by another local project.
- **`pnpm dev` complains about missing workspace package** — run `pnpm install` again from the
  repo root; workspace symlinks can go stale after a branch switch that adds/removes a package.
- **Migrations look "out of sync"** — run `supabase db reset` to drop and rebuild the local DB from
  scratch, then re-run migrate + seed (§4). Local data is disposable by design; never worry about
  losing it.
- **Browser fetch from the dashboard to the API fails with a CORS error, but `curl` works fine** —
  `curl` doesn't enforce CORS, so this only shows up in an actual browser. `apps/api` reads the
  allowed origin from `DASHBOARD_ORIGIN` (defaults to `http://localhost:3000`, Task A5a.1) — set it in
  `apps/api/.env` if you're running the dashboard on a different port or host.
- **`drizzle-kit generate` fails with `Cannot find module './orgs.js'` or similar** — you're probably
  invoking `drizzle-kit` directly instead of through the package script. Always use
  `pnpm --filter @syntaxwp/db generate`, which runs it through `tsx` — plain `drizzle-kit generate`
  can't resolve this project's NodeNext-style `.js`-suffixed relative imports across schema files.
- **`pnpm install` warns about `allowBuilds` or silently skips a native package's install script** —
  check `pnpm-workspace.yaml`; a newly added native dependency (like `sharp` was) needs an explicit
  `true` under `allowBuilds` and an entry in `onlyBuiltDependencies`, or pnpm 11 blocks its
  postinstall script by default.
- **Port already in use (3000/4000/9000/9001/54321-54323)** — another local project (or a stale
  process from a previous run) is holding the port. `lsof -i :<port>` to find and kill it, or stop
  the conflicting project's Docker containers.
- **Playwright/Wrangler-specific issues** — not applicable yet; both land with Tasks B5 and B3
  respectively (see §7/§8).
- **`pnpm dev:https` fails with `EACCES: permission denied :443`** — the script needs root to bind a
  privileged port; run it via `pnpm dev:https` as-is (it already shells out to `sudo`), don't run
  `node scripts/https-proxy.mjs` directly.
- **`pnpm dev:https` fails with `EADDRINUSE: address already in use :443`** — something else already
  owns port 443, most likely Valet or WP Engine's **Local** app running for other WordPress sites on
  this machine (`lsof -iTCP:443 -sTCP:LISTEN` to confirm). Quit/stop whichever one it is (Local: quit
  the whole app, no partial-stop CLI; Valet: `valet stop`) and retry. See §6.1.
- **`pnpm dev:https` never shows the Keychain trust dialog / browser still shows untrusted cert** —
  delete `~/Library/Application Support/devcert` and rerun; a stale or partially-created CA from an
  earlier interrupted run is the usual cause.
- **`https://api.syntaxwp.test` resolves but `https://app.syntaxwp.test` doesn't (or vice versa)** —
  almost always a malformed `/etc/hosts`: check `grep -n -A1 'app.syntaxwp.test\|api.syntaxwp.test'
  /etc/hosts` — if one entry got appended onto the end of an existing line (no leading newline, e.g.
  right after a `## Local - End ##` comment from Valet/Local's own hosts management), that whole line
  becomes a comment and the hostname never registers. Fix by splitting it onto its own line.
- **`https://app.syntaxwp.test` doesn't resolve at all** — confirm the `/etc/hosts` entries from §6.1
  are present (`grep syntaxwp /etc/hosts`) and that `pnpm dev:https` is actually running.

---

## 12. Reference: Full Directory Layout

```text
syntaxwp/
├── apps/
│   ├── dashboard/        # Next.js dashboard — port 3000
│   ├── api/              # Hono API + Graphile Worker — port 4000
│   └── probes/           # (not built yet — Task B3) Cloudflare Worker uptime probes
├── packages/
│   ├── shared/            # Zod schemas + TS types (FixIntent, WorkOrder, ...)
│   ├── db/                # Drizzle schema, migrations, seed script
│   └── plugin/            # (not built yet — Task A6) WordPress plugin (PHP)
├── docker-compose.yml     # MinIO (local R2 substitute)
├── supabase/              # Supabase CLI config (local Postgres/Auth/Realtime)
├── scripts/
│   └── https-proxy.mjs   # optional local HTTPS proxy — §6.1
├── pnpm-workspace.yaml
├── BACKEND-DEVELOPMENT-PLAN.md
└── LOCAL-DEVELOPMENT-SETUP.md
```

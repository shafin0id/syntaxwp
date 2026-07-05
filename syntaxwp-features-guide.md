# SyntaxWP Autonomous — Features & Functional Design Guide

This document lists the core features of the SyntaxWP Autonomous platform and details how they work under the hood, based strictly on the [syntaxwp-mvp-architecture-v11.md](file:///Users/shafinoid/Documents/GitHub/syntaxwp-design/syntaxwp-mvp-architecture-v11.md) specification.

---

## Table of Features

1. [Dual WordPress Execution Path](#1-dual-wordpress-execution-path)
2. [Automated Incident Detection Pipeline](#2-automated-incident-detection-pipeline)
3. [Four-Tier Diagnostic Method Stack](#3-four-tier-diagnostic-method-stack)
4. [Multi-Model LLM & AI Architecture](#4-multi-model-llm--ai-architecture)
5. [HMAC-Signed Work Order Security Engine](#5-hmac-signed-work-order-security-engine)
6. [Interactive, No-Chat Visual Dashboard](#6-interactive-no-chat-visual-dashboard)
7. [WooCommerce Protection Suite](#7-woocommerce-protection-suite)
8. [Vulnerability Feed & Code Integrity Scanner](#8-vulnerability-feed--code-integrity-scanner)
9. [Dead Man's Switch & Automated Revert System](#9-dead-mans-switch--automated-revert-system)

---

## 1. Dual WordPress Execution Path

SyntaxWP supports different WordPress environments by automatically routing through one of two execution paths depending on the core WordPress version of the client site.

### How it Works
* **WP 7.0+ Native Path:**
  * The plugin detects that the site runs WordPress 7.0 or higher.
  * It registers operational capabilities via the native **Abilities API** and exposes local-only **MCP (Model Context Protocol)** capability endpoints.
  * The SyntaxWP control plane connects via the local MCP endpoints to execute actions natively inside the WordPress core.
* **Pre-7.0 Legacy Path:**
  * If the WordPress version is below 7.0, or MCP endpoints are unavailable, the system defaults to an **outbound-only polling model**.
  * The client-side plugin polls the SyntaxWP control plane every 60 seconds to claim pending signed work orders.
  * The plugin validates the work order and executes it locally using a strict whitelist of 12 permitted actions.
  * Results and execution evidence are pushed outbound back to the control plane.
  * No inbound API endpoints are exposed on the client site, minimizing the attack surface.

---

## 2. Automated Incident Detection Pipeline

The detection pipeline continuously monitors client site health, capturing errors and anomalies from multiple independent channels to trigger diagnostic workflows.

```
┌─────────────────────────┐     ┌────────────────────────┐     ┌────────────────────────┐
│     PHP Fatal Event     │     │  Cloudflare Edge Probe │     │  WooCommerce Failed PS │
└───────────┬─────────────┘     └───────────┬────────────┘     └───────────┬────────────┘
            │                               │                              │
            └───────────────────────────────┼──────────────────────────────┘
                                            ▼
                                ┌──────────────────────┐
                                │ Incident Deduplicator│
                                └───────────┬──────────┘
                                            ▼
                                ┌──────────────────────┐
                                │ Graphile Worker Job  │
                                └──────────────────────┘
```

### How it Works
1. **PHP Fatal Error / Exception Capture:**
   * A native error handler in the plugin ([ErrorCapture.php](file:///Users/shafinoid/Documents/GitHub/syntaxwp-design/syntaxwp-mvp-architecture-v11.md#L230)) intercepts fatal runtime exceptions, capturing the stack trace, request URI, and currently active plugins.
   * It immediately posts a JSON payload to the Hono API (or Sentry Developer API), spawning a diagnostic worker job.
2. **Cloudflare Worker Uptime Probes:**
   * A scheduled Cloudflare Worker runs cron checks every 60 seconds from multiple regions.
   * It queries the site, measuring Time-to-First-Byte (TTFB) and inspecting the HTML body.
   * It detects **White Screen of Death (WSOD)** conditions (where HTTP status is 200 but the response body is under 500 characters) or raw connection errors (status $\ge 500$), and posts anomalies to the API.
3. **Heartbeat Drift Monitoring:**
   * The plugin sends health payloads (active plugin list, PHP version, DB size, etc.) every 60 seconds.
   * If the control plane detects a gap of over 180 seconds since the last heartbeat, it triggers a server-level outage alarm.
4. **WooCommerce Event Hooks:**
   * The plugin hooks into failed checkout events and payment failures, reporting them instantly to trigger immediate payment gateway diagnostics.
5. **Deduplication Engine:**
   * To prevent redundant alerts from concurrent edge probes, incoming incidents are hashed into a fingerprint (`site_id + error_type + plugin_slug + hour`).
   * The database runs an `INSERT ... ON CONFLICT DO NOTHING` statement to ensure only one active incident record is processed per unique issue.

---

## 3. Four-Tier Diagnostic Method Stack

When an incident is logged, SyntaxWP resolves it using a tiered diagnostic sequence, choosing the least intrusive method that yields a confident result.

### How it Works
* **Tier 1 — Health Check Troubleshooting Mode:**
  * **Scope:** Ideal for plugin/theme conflicts, JavaScript errors, or admin-only page breaks (covers 50–60% of incidents).
  * **Execution:** The plugin activates the official WordPress *Health Check & Troubleshooting* plugin (downloading/installing it via WP-CLI if missing). 
  * It turns on troubleshooting mode isolated entirely to a session cookie, meaning visitors are unaffected.
  * A Playwright runner logs into the admin session and performs a **binary search** (enabling 50% of plugins, checking for the issue, then narrowing to 25%, 12.5%, etc.).
  * The conflicting plugin is identified within $\le 5$ runs for a site with 30 plugins.
* **Tier 2 — Client's Own Staging Site:**
  * **Scope:** Required for testing code patches, database migrations, or plugin upgrades that cannot be safely run on production.
  * **Execution:** If a staging site is configured during onboarding, the control plane applies the proposed fix to the staging site via the staging plugin instance (using a separate, staging-scoped HMAC key).
  * Playwright runs visual regression tests and functional checks (checking out, submitting forms). If verified, the fix is promoted to production.
* **Tier 3 — Shared VM Micro-Clone:**
  * **Scope:** Used when no staging environment exists and the change carries medium-to-high risk.
  * **Execution:** The system builds a *Surgical Clone Manifest* containing only the files and database tables implicated in the conflict (e.g., plugin folders and the `options` table).
  * It provisions an ephemeral, per-minute billed Docker container, copies the files (~50–150MB), boots a minimal WordPress stack, runs tests, applies the fix, verifies it via Playwright, and destroys the container. **No PII, visitor databases, or media are ever copied.**
* **Tier 4 — Production with Consent:**
  * **Scope:** Simple, low-risk, and instantly reversible procedures (e.g., cache flushes, debug mode toggles, transient clearing).
  * **Execution:** A pre-action micro-snapshot is taken (active plugins, checksums of options and files), the action is executed, and a post-action uptime probe runs. If health degrades, the system executes an instant rollback.

---

## 4. Multi-Model LLM & AI Architecture

SyntaxWP separates cognitive tasks into specialized prompts and assigns them to the most cost-effective and task-appropriate model.

```
                  ┌────────────────────────┐
                  │     Incident Alert     │
                  └───────────┬────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────────┐
        │ Gemini 2.5 Flash-Lite                    │
        │ • Triage, Severity, & Method Assignment  │
        └─────────────┬────────────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────────────┐
        │ DeepSeek V4 Pro                          │
        │ • Evidence Correlation & Diagnosis       │
        │ • Fix Generation (Structured FixIntent)  │
        └─────────────┬────────────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────────────┐
        │ DeepSeek V4 Flash + php -l               │
        │ • Safety Audit & Syntax Verification     │
        └─────────────┬────────────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────────────┐
        │ Gemini 2.5 Flash-Lite                    │
        │ • Visual UI Regression Audit (Vision)    │
        └──────────────────────────────────────────┘
```

### How it Works
1. **Zero-Cost Known Signature Matcher:**
   * Before hitting any LLM API, the incoming error log is matched against a list of deterministic regex patterns (e.g., matching common database connection or missing WooCommerce function errors).
   * A matched pattern bypasses the LLM entirely, saving tokens and executing the known fix immediately.
2. **Triage & Classification (Gemini 2.5 Flash-Lite):**
   * Processes the error stack and outputs a structured classification (severity, class, diagnostic method) using the free tier (up to 1,500 requests/day).
3. **Evidence Correlation & Diagnosis (DeepSeek V4 Pro):**
   * Compares the site inventory, recent plugin updates, error logs, and heartbeats to pinpoint the root cause.
4. **Fix Generation (DeepSeek V4 Pro):**
   * Generates a precise `FixIntent` JSON matching a strict Zod schema definition.
5. **Safety Gate (DeepSeek V4 Flash & PHP Linter):**
   * The generated PHP code is run through a native syntax linter (`php -l`) inside the container to prevent compilation errors.
   * DeepSeek V4 Flash audits the logic against safety constraints (ensuring no `eval()`, backdoors, or arbitrary executions exist).
6. **Visual UI Audit (Gemini 2.5 Flash-Lite Vision):**
   * Compares screenshot files taken of the staging page before and after a fix to check for visual breaks or broken layouts.

---

## 5. HMAC-Signed Work Order Security Engine

To prevent prompt injections from triggering unauthorized actions, the system utilizes a deterministic security layer where the LLM is completely isolated from execution capabilities.

### How it Works
1. **FixIntent Schema Validation:**
   * The LLM's raw output is parsed and validated against a strict TypeScript Zod schema ([FixIntentSchema](file:///Users/shafinoid/Documents/GitHub/syntaxwp-design/syntaxwp-mvp-architecture-v11.md#L677)).
2. **Policy Engine Check:**
   * The validated intent is fed into a deterministic, non-AI Policy Engine. It maps the requested action against the site's configured permission tier (`full_auto`, `some_access`, or `manual`) and the action's risk classification (e.g., `flush_cache` is low risk; `update_plugin` is high risk; `run_arbitrary_command` is blocked permanently).
   * The engine outputs `allow`, `ask` (requiring user confirmation), or `block`.
3. **HMAC Generation:**
   * If allowed or approved by the user, the control plane generates a `WorkOrder` JSON payload, adding a unique nonce, timestamp, and short expiration window (5 minutes).
   * It signs the payload using `hash_hmac('sha256', payload, site_secret)`, where the secret is stored encrypted in the Supabase database.
4. **Plugin Validation & Execution:**
   * The client-side plugin fetches/claims the work order and validates it:
     1. Recomputes and verifies the HMAC signature using the local `syntaxwp_site_secret`.
     2. Verifies the current timestamp has not exceeded `expires_at` (preventing replay attacks).
     3. Checks the nonce transient cache to ensure it has not been executed previously.
     4. Verifies the requested action matches a strict local PHP whitelist ([ActionWhitelist.php](file:///Users/shafinoid/Documents/GitHub/syntaxwp-design/syntaxwp-mvp-architecture-v11.md#L246)).
   * If all checks pass, the action is executed.

---

## 6. Interactive, No-Chat Visual Dashboard

The control panel provides a user interface structured entirely around visual workflows rather than text-based chat.

### How it Works
* **Execution Stepper Cards:**
  * Incidents are represented as card components showing the exact pipeline stage (e.g., `Monitoring detected issue` $\rightarrow$ `Problem diagnosed` $\rightarrow$ `Fix tested in staging` $\rightarrow$ `Awaiting approval`).
  * Live updates are pushed to the UI in real time using Server-Sent Events (SSE) hosted on the Hono API server.
* **Inline Approval Controls:**
  * Steppers render simple action buttons for users to `Approve Fix`, `Decline`, or `See Evidence` (which displays visual diffs or error logs).
* **Persistent Status Sidebar:**
  * Shows a consolidated health dial (calculated dynamically from uptime, pending updates, vulnerabilities, SSL validity, and backup intervals) alongside a list of available restore points.
* **Health Score Algorithm:**
  * Uses a TypeScript calculation helper to deduct points from a starting score of 100 based on health metrics (e.g., $-15$ if uptime $<99.9\%$, $-20$ per critical vulnerability, $-15$ if SSL expires in $<14$ days).

---

## 7. WooCommerce Protection Suite

Given the critical nature of e-commerce checkout flows, the platform provides dedicated safety features for WooCommerce stores.

### How it Works
1. **Playwright Synthetic Checkouts:**
   * Runs an automated worker job every 10 minutes.
   * A Chromium browser adds a configured test product to the cart, navigates to the checkout page, verifies the presence of billing inputs and payment elements (Stripe/PayPal containers), and listens for JavaScript console errors.
   * If payment elements are missing or console errors fire, it triggers an immediate checkout failure incident.
2. **Anonymized Failure Hooking:**
   * The plugin registers hooks to track order creation and status transitions (`woocommerce_checkout_order_created` and `woocommerce_payment_complete_order_status`).
   * It hashes the order ID using SHA-256 to track status without storing or transferring Personally Identifiable Information (PII). Failed checkout hooks dispatch immediate HTTP reports to the API.
3. **Revenue Loss Estimator:**
   * If a WooCommerce site goes offline or checkouts fail, the platform estimates financial impact.
   * It multiplies the duration of the outage by the average hourly revenue (extracted via API reports over 30 days) and applies a peak-hour multiplier ($1.8\times$) if the outage occurred during high-traffic intervals.

---

## 8. Vulnerability Feed & Code Integrity Scanner

The platform checks for core, plugin, and theme vulnerabilities using public data feeds and local integrity checks.

### How it Works
* **OSV & GitHub Advisory Sync:**
  * A background worker queries the `api.osv.dev` ecosystem feed every 6 hours, filtering for "WordPress" advisories and caching them in the local database.
* **Local Checksum Audits:**
  * The plugin queries official WordPress.org APIs for official file MD5 checksum hashes.
  * It verifies local files against these checksums to immediately flag unauthorized file modifications or hacked core files.
* **Premium & Custom Plugin Safety:**
  * For private or custom plugins not in the official repository, the system maps directory names to known ecosystem vulnerability slugs.
  * Upon registration or safe update, `MicroSnapshot.php` builds a local cryptographic SHA-256 file manifest.
  * Subsequent heartbeats verify file hashes against the baseline, flagging unauthorized alterations or newly injected scripts (web shells).
  * The plugin intercepts local update transients (`update_plugins` option) to catch available updates from custom servers, enabling them to be staged and tested before installation.

---

## 9. Dead Man's Switch & Automated Revert System

The Dead Man's Switch serves as the primary failsafe when deploying changes directly to a production environment.

```
                  ┌────────────────────────┐
                  │  Deploy Fix to Prod    │
                  └───────────┬────────────┘
                              │
                              ├──────────────────────────────┐
                              ▼                              ▼
                 ┌────────────────────────┐     ┌────────────────────────┐
                 │ Arm Dead Man's Switch  │     │ Post-Deploy Check      │
                 │ (Run Revert Job in X s)│     │ (Heartbeat/Uptime Check│
                 └────────────┬───────────┘     └────────────┬───────────┘
                              │                              │
                              │                              ▼
                              │                 Are check results healthy?
                              │                 ├─ Yes ──► Disarm Switch
                              │                 └─ No ───► Do Nothing
                              ▼
                     Does Switch fire?
                     (Timer Exceeded)
                              │
                              ▼
               ┌─────────────────────────────┐
               │ Execute Rollback (Snapshot) │
               │ Escalate to Human Developer │
               └─────────────────────────────┘
```

### How it Works
1. **Arming the Switch:**
   * When a work order is sent to production, the control plane schedules a Graphile Worker job (`dead_mans_switch_fire`) set to execute after a short delay (e.g., 120 to 600 seconds, depending on the risk level of the action).
2. **Post-Deploy Validation:**
   * After the plugin applies the fix, it reports back execution logs and triggers a post-deploy health check (requesting immediate Cloudflare Worker uptime probes).
3. **Disarming or Firing:**
   * **Healthy Response:** If the health checks pass and a successful heartbeat is received within the timeframe, the control plane cancels and deletes the scheduled reversion job.
   * **Failure/Timeout:** If the health check fails, or the timer expires without a positive health confirmation, the switch fires. The worker executes an automated rollback to the pre-action snapshot, restores files and settings, issues an alert to the dashboard, and places the incident in an `awaiting_human` state.

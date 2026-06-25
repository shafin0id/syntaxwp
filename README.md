# SyntaxWP — Product Features Specification

This document lists and explains all product features for **SyntaxWP Autonomous**, incorporating the core capabilities of WordPress 7, hybrid staging/sandbox execution modes, performance auditing via browser APIs, event-based WooCommerce monitoring, and a unified chat-first dashboard UX.

---

## 1. WordPress 7 Support & Compatibility

* **WordPress 7.0 Core Abilities Integration**
  Uses the native WP 7 core Abilities API and built-in Model Context Protocol (MCP) servers to execute maintenance actions, keeping our client-side plugin footprint extremely lightweight and secure.
* **Graceful Backward Compatibility Fallback**
  Enables sites running older WordPress versions to use all standard monitoring and maintenance features, while cleanly disabling features that depend on WP 7 core APIs.

---

## 2. Core Autonomous Operations

* **Real-Time Uptime Monitoring**
  Performs continuous HTTP probes (including status codes, TTFB, and page content checks) from external edge workers to detect outages and performance degradation.
* **Fatal Error & WSOD Detection**
  Captures PHP execution failures and White Screen of Death (WSOD) states instantly using plugin-side exception hooks, triggering immediate diagnostic workflows.
* **Autonomous Diagnostic Agent**
  Correlates server error logs, plugin version logs, and configuration changes through LLM reasoning to identify the root cause of an incident.
* **Hybrid Sandbox/Staging Fix Pipeline**
  Clones and tests fixes on host-provided staging environments; if no staging is configured, it runs mock test edits locally on production using health-check mocking, only after showing a prominent warning and gaining explicit customer consent.
* **Granular Permission & Approval Settings**
  Allows site admins to toggle execution safety settings between "Full Auto" (fully autonomous), "Some Access" (needs approval for high-risk actions), and "100% Manual" (always asks for approval).
* **One-Click Revert**
  Creates automatic file and database snapshots prior to any change, allowing the administrator to revert any agent action instantly with a single click.
* **Dead Man's Switch Rollback**
  Monitors active operations through an external timer, triggering an automatic rollback to the pre-change backup if the site crashes or the agent fails to report a post-deploy heartbeat.
* **Site Health Scoring**
  Computes a visual metric based on active vulnerabilities, pending core/plugin updates, uptime averages, and unresolved database optimization alerts.
* **Immutable Audit Trail**
  Logs all actions taken by the agent or site administrators to an append-only database table, accessible strictly by authorized admin, editor, or author roles to preserve accountability.

---

## 3. Proactive Maintenance

* **Safe Update Manager**
  Validates plugin, theme, or WordPress core updates in staging before applying them to production, fallback-updating directly on production with automatic revert-guardrails only upon manual approval if staging doesn't exist.
* **SSL & Domain Watch**
  Regularly checks DNS configuration, SSL certificate expiration, and domain registration status to alert owners before renewals are missed.
* **Manual Export-Only Care Reports**
  Compiles monthly summaries of uptime, updates applied, and incidents resolved, allowing users to manually generate and export reports as files instead of sending them via email.
* **Open-Source Vulnerability Matching**
  Ingests public, open-source vulnerability lists (like GitHub Advisory and Google OSV databases) to our API backend to cross-reference plugin inventories locally with zero API costs.
* **Database Hygiene**
  Automates the safe deletion of expired transients, database table overhead, comment spam, and revisions, warning users if autoloaded options exceed size thresholds.

---

## 4. Performance & Analytics

* **Plugin-Level Visitor Tracking**
  Tracks basic, GDPR-compliant pageview counts directly within our plugin, or integrates with the customer's Google Analytics API to pull key visitor statistics into the dashboard.
* **Core Web Vitals Auditing (Browser API)**
  Uses free Chrome/Browser User Experience APIs to query real-world user metrics (LCP, INP, CLS) without adding client-side script overhead.
* **Root Cause Performance Suggestion**
  Identifies exact assets (like unoptimized images or slow database queries) causing performance bottlenecks and presents pre-planned, safe fixes for one-click approval.
* **Autonomous Caching Tuning (Future)**
  Optimizes speed by directly modifying settings in popular caching plugins (like WP Rocket and LiteSpeed Cache) to resolve identified performance bottlenecks.
* **Speed Alerts**
  Sends alert telemetry whenever average page weights, TTFB, or asset load times cross historical thresholds.

---

## 5. WooCommerce Revenue Protection

* **WooCommerce Data Extraction**
  Pulls transaction health data, active payment gateway states, and checkout logs directly from WooCommerce's built-in core API endpoints.
* **Active Checkout Monitoring**
  Triggers lightweight Playwright synthetic checks every 5–10 minutes to verify that cart, user accounts, and billing sections load successfully.
* **Event-Based Checkout Failure Trigger**
  Detects abandoned or failed checkout attempts in real time, instantly invoking the diagnostic agent to identify and patch database locks or payment gateway exceptions.
* **Payment Gateway Endpoint Monitoring**
  Validates payment gateway APIs (e.g., Stripe, PayPal) periodically to verify authentication tokens are active and gateways are accepting test payments.
* **Transactional Email Watch**
  Monitors the delivery state of order confirmation and shipping notification emails to ensure mail queues do not become stuck.
* **Revenue Loss Estimator**
  Displays real-time calculations of potential lost revenue during checkout outages, based on average hourly order values.

---

## 6. "Chat with Your Site" (Unified UX Centerpiece)

* **Unified Chat-First Dashboard**
  A central ChatGPT/Gemini-style conversational console that acts as the primary cockpit for the entire application, housing all diagnostic outputs, action execution feeds, and user-prompted queries in a unified timeline.
* **Actionable Inline Execution Stepper**
  Renders real-time, collapsible visual cards detailing the agent's sub-tasks as they execute (e.g., `[Triage Logs] ➔ [Evidence Captured] ➔ [Fix Proposed] ➔ [Playwright Test] ➔ [Verify Health]`), avoiding walls of raw terminal output and replacing them with clean status badges and loading states.
* **Interactive Approval & Option Cards**
  Renders clean, structured JSON schemas from the policy engine directly inside the chat feed as interactive UI components, providing the user with prominent "Approve Fix," "Decline," and "Select Alternative Action" controls.
* **Cross-Tab Contextual Redirection**
  Redirecting the user instantly to the Chat console whenever they click an action button (e.g., "Fix Issue" in the Performance tab, or "Update" in the Plugins grid), automatically initiating a new agent workflow block in the chat timeline, complete with a visual diagnostic stepper.
* **Dynamic Conversational Steering**
  Allows the user to input prompts at any stage of execution to override or steer the agent's behavior (e.g., "Wait, abort the current update," "Only update Akismet," or "Revert the last deactivation"), immediately triggering a workflow cancellation signal and spawning a new plan in real-time.
* **Real-time Event Synchronization (Hono SSE & Temporal Signals)**
  Drives the chat feed using Server-Sent Events (SSE) from the Hono API backend, mirroring active Temporal workflows and pushing execution state changes to the UI within milliseconds.
* **Persistent Site Status Sidebar**
  A stationary side-panel housing a real-time site health dial (0-100), active alerts/warnings, pending plugin updates, and a visual list of **historical restore points** (allowing users to click and trigger a revert of any previous action immediately).
* **Conversational Context Memory & Recovery**
  Maintains active chat state history in PostgreSQL mapped to site IDs and incident IDs, allowing users to leave the tab and return later to see the exact execution history, status updates, and interactive controls preserved without loss of context.


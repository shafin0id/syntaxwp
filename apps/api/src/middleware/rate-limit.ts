import type { Context, Env, MiddlewareHandler } from "hono";

// §15.2 endpoint classes. `probe` is defined here for Track B's own
// src/routes/probes.ts to apply (file ownership split, BACKEND-DEVELOPMENT-
// PLAN.md §0.3) — not wired to any route in this file. `work_claims` is
// defined now, wired in A5b.3 once the work-order claim endpoint exists.
export type RateLimitClass = "heartbeat" | "events" | "probe" | "work_claims";

interface RateLimitConfig {
  windowMs: number;
  max: number;
}

// A9.1 — matches §15.2's own reference numbers exactly, not a freehand
// guess: Track B (whose synthetic checks would otherwise be the "real
// traffic shapes" this task was written against) hasn't landed, so there is
// no live traffic to tune against yet. The architecture doc's own spec is
// the best available signal until there is — closer to ground truth than
// the ad hoc starting values this file shipped with pre-A9. Revisit once
// Track B's probe traffic and the legacy poller's real claim cadence are
// both observable.
const CONFIGS: Record<RateLimitClass, RateLimitConfig> = {
  heartbeat: { windowMs: 60_000, max: 6 }, // ~1 per 10s; plugin heartbeats every 60s (§4.3)
  events: { windowMs: 60_000, max: 60 }, // 1/sec burst allowance
  probe: { windowMs: 60_000, max: 120 }, // edge probes fan out from 200+ Cloudflare regions
  work_claims: { windowMs: 60_000, max: 12 },
};

interface WindowState {
  count: number;
  windowStart: number;
}

// One Map per process — an explicit, accepted limitation (see
// BACKEND-DEVELOPMENT-PLAN.md's A9.1 note): multiple API instances each get
// an independent counter, effectively multiplying the configured limit by
// instance count. There's no Redis in this stack (§0.1); acceptable for a
// single-instance MVP deploy, revisit with a Postgres-backed counter or
// Redis if/when this deploys behind more than one instance.
const state = new Map<string, WindowState>();

// Sweeps entries untouched for 2x the longest configured window — without
// this, `state` grows by one entry per (class, key) ever seen, forever. A
// dropped entry just means the next request starts a fresh window, which is
// correct anyway once an entry is that stale.
const MAX_CONFIGURED_WINDOW_MS = Math.max(...Object.values(CONFIGS).map((c) => c.windowMs));
const SWEEP_INTERVAL_MS = 5 * 60_000;
const timer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of state) {
    if (now - entry.windowStart > 2 * MAX_CONFIGURED_WINDOW_MS) {
      state.delete(key);
    }
  }
}, SWEEP_INTERVAL_MS);
timer.unref(); // never keep the process alive for this alone

export function rateLimit<E extends Env = Env>(
  rateLimitClass: RateLimitClass,
  keyFn: (c: Context<E>) => string,
): MiddlewareHandler<E> {
  const config = CONFIGS[rateLimitClass];
  return async (c, next) => {
    const key = `${rateLimitClass}:${keyFn(c)}`;
    const now = Date.now();
    const entry = state.get(key);

    if (!entry || now - entry.windowStart >= config.windowMs) {
      state.set(key, { count: 1, windowStart: now });
      await next();
      return;
    }

    if (entry.count >= config.max) {
      c.header("Retry-After", Math.ceil((entry.windowStart + config.windowMs - now) / 1000).toString());
      return c.json({ error: "rate limit exceeded" }, 429);
    }

    entry.count += 1;
    await next();
  };
}

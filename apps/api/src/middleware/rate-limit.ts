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

// Starting points, not final — tuned against real traffic shapes in A9.1
// once Track B's synthetic checks produce some. Heartbeats fire every 60s
// per §4.3, so `max` has headroom for retries/clock skew without being so
// loose the limit stops meaning anything.
const CONFIGS: Record<RateLimitClass, RateLimitConfig> = {
  heartbeat: { windowMs: 60_000, max: 5 },
  events: { windowMs: 60_000, max: 30 },
  probe: { windowMs: 60_000, max: 10 },
  work_claims: { windowMs: 60_000, max: 20 },
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

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit.js";

// Each test uses a unique key (via a unique query param) so tests don't
// interact through the module-level `state` Map, which is intentionally
// process-lifetime, not per-test.
function buildApp(rateLimitClass: Parameters<typeof rateLimit>[0]) {
  return new Hono().get(
    "/test",
    rateLimit(rateLimitClass, (c) => c.req.query("key") ?? "default"),
    (c) => c.json({ ok: true }),
  );
}

describe("rateLimit", () => {
  it("allows requests under the configured max", async () => {
    const app = buildApp("heartbeat"); // max: 5
    const key = `under-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      const res = await app.request(`/test?key=${key}`);
      expect(res.status).toBe(200);
    }
  });

  it("rejects the request once the max is exceeded within the window", async () => {
    const app = buildApp("heartbeat"); // max: 5
    const key = `over-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      await app.request(`/test?key=${key}`);
    }
    const res = await app.request(`/test?key=${key}`);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("scopes limits independently per key", async () => {
    const app = buildApp("heartbeat");
    const keyA = `scope-a-${Math.random()}`;
    const keyB = `scope-b-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      await app.request(`/test?key=${keyA}`);
    }
    // keyA is now exhausted, keyB should be unaffected
    const resA = await app.request(`/test?key=${keyA}`);
    const resB = await app.request(`/test?key=${keyB}`);
    expect(resA.status).toBe(429);
    expect(resB.status).toBe(200);
  });

  it("scopes limits independently per rate-limit class", async () => {
    const heartbeatApp = buildApp("heartbeat"); // max: 5
    const eventsApp = buildApp("events"); // max: 30
    const key = `class-scope-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      await heartbeatApp.request(`/test?key=${key}`);
    }
    const heartbeatRes = await heartbeatApp.request(`/test?key=${key}`);
    const eventsRes = await eventsApp.request(`/test?key=${key}`);
    expect(heartbeatRes.status).toBe(429);
    expect(eventsRes.status).toBe(200); // same key, different class — separate counter
  });
});

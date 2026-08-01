import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, sql, createOrg, createSite, insertAuditLog } from "@syntaxwp/db";
import { createApp } from "../app.js";
import { env } from "../env.js";
import { supabaseAdmin } from "../auth/supabase.js";

// Integration test — needs a live local Supabase stack + migration
// 0006_audit_log_notify_trigger.sql applied, same caveats as sites.test.ts
// and realtime/site-events.test.ts. This is the acceptance check for A5b.2
// end-to-end: a real dashboard session opens the stream, a real audit_log
// INSERT fires the trigger, and the bytes land on the HTTP response.
describe("GET /api/sites/:id/stream", () => {
  const app = createApp();
  let accessToken: string;
  let orgId: string;

  beforeAll(async () => {
    const org = await createOrg(db, { name: "stream-route-test-org" });
    orgId = org.id;

    const email = `stream-test-${randomUUID()}@syntaxwp.local`;
    const password = "test-password-12345";
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { org_id: orgId },
    });
    if (createErr) throw createErr;

    const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw error ?? new Error("no session returned");
    accessToken = data.session.access_token;
  });

  afterAll(async () => {
    await sql.end();
  });

  it("rejects an unauthenticated request", async () => {
    const site = await createSite(db, {
      orgId,
      url: "http://stream-unauth-test.example",
      siteSecretCiphertext: "irrelevant",
    });
    const res = await app.request(`/api/sites/${site.id}/stream`);
    expect(res.status).toBe(401);
  });

  it("returns 404 for a site owned by a different org", async () => {
    const otherOrg = await createOrg(db, { name: "stream-route-test-other-org" });
    const otherSite = await createSite(db, {
      orgId: otherOrg.id,
      url: "http://stream-not-yours.example",
      siteSecretCiphertext: "irrelevant",
    });
    const res = await app.request(`/api/sites/${otherSite.id}/stream`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(404);
  });

  it("streams an audit_log INSERT to the SSE response as it happens", async () => {
    const site = await createSite(db, {
      orgId,
      url: "http://stream-route-test.example",
      siteSecretCiphertext: "irrelevant",
    });

    const res = await app.request(`/api/sites/${site.id}/stream`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let received = "";

    // Give subscribeToSiteEvents a moment to attach before the INSERT fires
    // the trigger — otherwise this is a genuine race, not a flaky test.
    await new Promise((r) => setTimeout(r, 100));
    await insertAuditLog(db, {
      siteId: site.id,
      eventType: "stream_route_test_event",
      actor: "system",
      summary: "hello over SSE",
    });

    const deadline = Date.now() + 5000;
    while (!received.includes("stream_route_test_event") && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value);
    }
    await reader.cancel();

    expect(received).toContain("event: stream_route_test_event");
    expect(received).toContain("hello over SSE");
  });
});

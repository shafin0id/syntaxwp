import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  db,
  sql,
  createOrg,
  createSite,
  claimNextPendingWorkOrder,
  issueWorkOrder,
  issueWorkOrderWithPolicy,
  listAuditLogForSite,
} from "@syntaxwp/db";
import { encryptSiteSecret, generateSiteSecret, signPayload } from "@syntaxwp/shared";
import { createApp } from "../app.js";
import { env } from "../env.js";
import { supabaseAdmin } from "../auth/supabase.js";
import { _releaseWorkerUtilsForTests } from "../worker/tasks/dead-mans-switch.js";

// One shared `sql` connection across every describe block in this file —
// closed exactly once, after everything below has run, not per describe
// block (an early sql.end() left later blocks in this file hitting
// CONNECTION_ENDED — the same bug already fixed once in packages/db's own
// work-orders.test.ts).
afterAll(async () => {
  await _releaseWorkerUtilsForTests();
  await sql.end();
});

// Integration test — needs a live local Supabase stack, same caveat as
// A5a.2a's sites.test.ts (not yet wired into CI, Task A8.2).
describe("work-orders approve/decline routes", () => {
  const app = createApp();
  let accessToken: string;
  let orgId: string;
  let siteId: string;

  beforeAll(async () => {
    const org = await createOrg(db, { name: "work-order-routes-test-org" });
    orgId = org.id;
    const site = await createSite(db, {
      orgId,
      url: "http://work-order-routes-test.example",
      siteSecretCiphertext: "irrelevant",
    });
    siteId = site.id;

    const email = `wo-routes-test-${randomUUID()}@syntaxwp.local`;
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

  async function makeAwaitingApprovalOrder() {
    const { workOrder } = await issueWorkOrderWithPolicy(db, {
      siteId,
      action: "deactivate_plugin",
      risk: "medium",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
      tier: "full_auto",
    });
    return workOrder!.row.id;
  }

  it("approves a pending-approval work order and writes an audit log entry", async () => {
    const id = await makeAwaitingApprovalOrder();
    const res = await app.request(`/api/work-orders/${id}/approve`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "pending" });

    const logs = await listAuditLogForSite(db, siteId);
    expect(logs.some((l) => l.eventType === "work_order_approved" && l.workOrderId === id)).toBe(
      true,
    );
  });

  it("declines a pending-approval work order and writes an audit log entry", async () => {
    const id = await makeAwaitingApprovalOrder();
    const res = await app.request(`/api/work-orders/${id}/decline`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "declined" });

    const logs = await listAuditLogForSite(db, siteId);
    expect(logs.some((l) => l.eventType === "work_order_declined" && l.workOrderId === id)).toBe(
      true,
    );
  });

  it("returns 409 approving a work order that's already been approved", async () => {
    const id = await makeAwaitingApprovalOrder();
    await app.request(`/api/work-orders/${id}/approve`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const second = await app.request(`/api/work-orders/${id}/approve`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(second.status).toBe(409);
  });

  it("returns 401 without a session", async () => {
    const id = await makeAwaitingApprovalOrder();
    const res = await app.request(`/api/work-orders/${id}/approve`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a work order belonging to a different org", async () => {
    const otherOrg = await createOrg(db, { name: "work-order-routes-test-other-org" });
    const otherSite = await createSite(db, {
      orgId: otherOrg.id,
      url: "http://not-yours.example.com",
      siteSecretCiphertext: "irrelevant",
    });
    const { workOrder } = await issueWorkOrderWithPolicy(db, {
      siteId: otherSite.id,
      action: "deactivate_plugin",
      risk: "medium",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
      tier: "full_auto",
    });

    const res = await app.request(`/api/work-orders/${workOrder!.row.id}/approve`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(404);
  });
});

// A7.2 — the execution-report round-trip the legacy plugin path needs to
// close the loop after claiming+executing (armDeadMansSwitch's own comment
// already called out this call site as "Task A5b adds" — it didn't get
// built until the legacy path actually needed it end to end).
describe("POST /api/work-orders/:id/result", () => {
  const app = createApp();

  async function makeClaimedOrder() {
    const org = await createOrg(db, { name: "result-route-test-org" });
    const plaintext = generateSiteSecret();
    const ciphertext = encryptSiteSecret(
      plaintext,
      Buffer.from(env.SITE_SECRET_ENCRYPTION_KEY, "base64"),
    );
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://result-route-test.example",
      siteSecretCiphertext: ciphertext,
    });
    await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: plaintext,
    });
    const claimed = await claimNextPendingWorkOrder(db, site.id);
    return { site, secret: plaintext, workOrderId: claimed!.id };
  }

  function signedResultBody(siteId: string, secret: string, nonce: string, result: Record<string, unknown>) {
    const payload = { site_id: siteId, timestamp: Math.floor(Date.now() / 1000), nonce, result };
    return { ...payload, hmac: signPayload(payload, secret) };
  }

  async function getScheduledDmsJob(workOrderId: string) {
    const rows = await sql`select * from graphile_worker.jobs where key = ${`dms_${workOrderId}`}`;
    return rows[0];
  }

  it("marks a claimed order executed, logs it, and arms the dead man's switch on success", async () => {
    const { site, secret, workOrderId } = await makeClaimedOrder();
    const res = await app.request(`/api/work-orders/${workOrderId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        signedResultBody(site.id, secret, "result-1", { success: true, action: "flush_cache" }),
      ),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "executed" });

    const logs = await listAuditLogForSite(db, site.id);
    const entry = logs.find((l) => l.eventType === "work_order_executed" && l.workOrderId === workOrderId);
    expect(entry?.summary).toContain("success");

    const job = await getScheduledDmsJob(workOrderId);
    expect(job).toBeDefined();
    expect(job.task_identifier).toBe("dead_mans_switch_fire");
  });

  it("still marks the order executed but never arms the switch on a failure result", async () => {
    const { site, secret, workOrderId } = await makeClaimedOrder();
    const res = await app.request(`/api/work-orders/${workOrderId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        signedResultBody(site.id, secret, "result-2", { success: false, reason: "not_implemented" }),
      ),
    });

    expect(res.status).toBe(200);
    const logs = await listAuditLogForSite(db, site.id);
    const entry = logs.find((l) => l.eventType === "work_order_executed" && l.workOrderId === workOrderId);
    expect(entry?.summary).toContain("failure");

    expect(await getScheduledDmsJob(workOrderId)).toBeUndefined();
  });

  it("returns 409 reporting a result for an order that isn't claimed", async () => {
    const { site, secret, workOrderId } = await makeClaimedOrder();
    await app.request(`/api/work-orders/${workOrderId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signedResultBody(site.id, secret, "result-3a", { success: true })),
    });

    const second = await app.request(`/api/work-orders/${workOrderId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signedResultBody(site.id, secret, "result-3b", { success: true })),
    });
    expect(second.status).toBe(409);
  });

  it("returns 404 reporting a result for a work order belonging to a different site", async () => {
    const { workOrderId } = await makeClaimedOrder();
    // otherSite authenticates validly as *itself* — the 404 comes from
    // ownership, not a signature failure, so this must sign with
    // otherSite's own secret, not the target order's site's secret.
    const { site: otherSite, secret: otherSecret } = await makeClaimedOrder();

    const res = await app.request(`/api/work-orders/${workOrderId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        signedResultBody(otherSite.id, otherSecret, "result-cross-site", { success: true }),
      ),
    });
    expect(res.status).toBe(404);
  });

  it("returns 401 when the signature doesn't match the site's secret", async () => {
    const { site, workOrderId } = await makeClaimedOrder();
    const res = await app.request(`/api/work-orders/${workOrderId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        signedResultBody(site.id, "wrong-secret", "result-badsig", { success: true }),
      ),
    });
    expect(res.status).toBe(401);
  });
});

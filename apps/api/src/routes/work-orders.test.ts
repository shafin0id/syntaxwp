import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  db,
  sql,
  createOrg,
  createSite,
  issueWorkOrderWithPolicy,
  listAuditLogForSite,
} from "@syntaxwp/db";
import { createApp } from "../app.js";
import { env } from "../env.js";
import { supabaseAdmin } from "../auth/supabase.js";

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

  afterAll(async () => {
    await sql.end();
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

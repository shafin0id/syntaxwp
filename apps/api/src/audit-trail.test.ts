import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  db,
  sql,
  createOrg,
  createSite,
  incidents,
  issueWorkOrderWithPolicy,
  listAuditLogForSite,
} from "@syntaxwp/db";
import { encryptSiteSecret, generateSiteSecret, loadSiteSecretEncryptionKey, signPayload } from "@syntaxwp/shared";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { supabaseAdmin } from "./auth/supabase.js";
import { _releaseWorkerUtilsForTests, deadMansSwitchFire } from "./worker/tasks/dead-mans-switch.js";

afterAll(async () => {
  await _releaseWorkerUtilsForTests();
  await sql.end();
});

// A8.1's own acceptance check — not a unit test of any one repository or
// route (those already exist per-subsystem), but a single walk through the
// whole incident -> work-order -> execute -> revert pipeline built across
// A3-A7, asserting every step along the way left its own audit_log row.
// Deliberately drives every step the way its real caller would (HTTP routes
// with signed/session-authed requests, the actual Graphile Worker task
// function for the switch fire) rather than calling repository functions
// directly, so this fails if any *wiring* between subsystems is missing,
// not just if a repository function itself is broken.
describe("audit trail: incident -> work order -> execute -> revert", () => {
  const app = createApp();
  const encryptionKey = loadSiteSecretEncryptionKey(env.SITE_SECRET_ENCRYPTION_KEY);

  it("leaves the full expected event_type sequence in audit_log", async () => {
    const originalFetch = global.fetch;
    vi.spyOn(global, "fetch").mockImplementation(async (url, options) => {
      if (url.toString().includes("audit-trail-e2e.example")) {
        return { status: 200 } as any;
      }
      return originalFetch(url, options);
    });

    const org = await createOrg(db, { name: "audit-trail-e2e-org" });
    const siteSecret = generateSiteSecret();
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://audit-trail-e2e.example",
      siteSecretCiphertext: encryptSiteSecret(siteSecret, encryptionKey),
    });

    // Track B (incident detection/ingestion) hasn't landed yet, so there is
    // no repository for this — inserted directly against the schema, same
    // as Track B's own eventual issuance code would do once it exists.
    const [incident] = await db
      .insert(incidents)
      .values({
        siteId: site.id,
        fingerprint: `audit-trail-e2e-${randomUUID()}`,
        type: "plugin_conflict",
        severity: "medium",
      })
      .returning();

    // deactivate_plugin: medium risk, so policyDecision asks for approval
    // regardless of tier (§9.3) — exercises the awaiting_approval/approve
    // leg of the lifecycle, not just the low-risk auto-allow path. It also
    // has a clean mechanical inverse (activate_plugin), so the eventual
    // revert has something to actually queue.
    const { decision, workOrder } = await issueWorkOrderWithPolicy(db, {
      siteId: site.id,
      incidentId: incident.id,
      action: "deactivate_plugin",
      target: "some-conflicting-plugin",
      risk: "medium",
      deadMansSwitchMs: 30_000,
      siteSecret,
      tier: "full_auto",
    });
    expect(decision).toBe("ask");
    const workOrderId = workOrder!.row.id;

    const email = `audit-trail-e2e-${randomUUID()}@syntaxwp.local`;
    const password = "test-password-12345";
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { org_id: org.id },
    });
    if (createErr) throw createErr;
    const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const { data: session, error: signInErr } = await anon.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr || !session.session) throw signInErr ?? new Error("no session returned");

    const approveRes = await app.request(`/api/work-orders/${workOrderId}/approve`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.session.access_token}` },
    });
    expect(approveRes.status).toBe(200);

    function sign(payload: Record<string, unknown>) {
      return { ...payload, hmac: signPayload(payload, siteSecret) };
    }

    const claimRes = await app.request(`/api/sites/${site.id}/work-orders/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        sign({ site_id: site.id, timestamp: Math.floor(Date.now() / 1000), nonce: "e2e-claim" }),
      ),
    });
    expect(claimRes.status).toBe(200);

    const resultRes = await app.request(`/api/work-orders/${workOrderId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        sign({
          site_id: site.id,
          timestamp: Math.floor(Date.now() / 1000),
          nonce: "e2e-result",
          result: { success: true, action: "deactivate_plugin" },
        }),
      ),
    });
    expect(resultRes.status).toBe(200);

    // Simulates the switch firing without waiting out the real 30s timeout —
    // this is the actual Graphile Worker task function, not a re-implementation
    // of its logic, so this exercises the same code the scheduled job runs.
    await deadMansSwitchFire({ workOrderId }, undefined as never);

    const logs = await listAuditLogForSite(db, site.id);
    const sequenceForThisOrder = logs
      .filter((l) => l.workOrderId === workOrderId)
      .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
      .map((l) => l.eventType);

    expect(sequenceForThisOrder).toEqual([
      "work_order_awaiting_approval",
      "work_order_approved",
      "work_order_claimed",
      "work_order_executed",
      "dead_mans_switch_fired",
      "work_order_reverted",
      "revert_escalated_to_human",
    ]);

    // Every entry in the sequence traces back to the same incident the
    // whole pipeline started from — the point of storing incidentId
    // alongside workOrderId on every row, not just the issuance one.
    expect(logs.filter((l) => l.workOrderId === workOrderId).every((l) => l.incidentId === incident.id)).toBe(
      true,
    );

    // executeRevert queued a corrective activate_plugin order for the
    // deactivate_plugin it undid — that issuance gets its own audit_log row
    // too (this fix's whole point), distinct from the original order's row.
    const correctiveLog = logs.find(
      (l) => l.eventType === "work_order_issued" && l.workOrderId !== workOrderId,
    );
    expect(correctiveLog).toBeDefined();
    expect(correctiveLog?.incidentId).toBe(incident.id);
  });
});

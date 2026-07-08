import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  db,
  sql,
  createOrg,
  createSite,
  getWorkOrderById,
  issueWorkOrder,
  listAuditLogForSite,
  workOrders,
} from "@syntaxwp/db";
import { encryptSiteSecret, loadSiteSecretEncryptionKey } from "@syntaxwp/shared";
import { env } from "../env.js";
import { captureSnapshot } from "./capture.js";
import { executeRevert } from "./revert.js";

afterAll(async () => {
  await sql.end();
});

// executeRevert decrypts the site's real secret to re-sign the corrective
// work order it issues — unlike other test suites' sites (which never
// exercise decryption), this one needs a genuinely encrypted ciphertext.
const encryptionKey = loadSiteSecretEncryptionKey(env.SITE_SECRET_ENCRYPTION_KEY);

async function makeExecutedWorkOrder(action: "deactivate_plugin" | "flush_cache", target?: string) {
  const org = await createOrg(db, { name: "revert-test-org" });
  const site = await createSite(db, {
    orgId: org.id,
    url: "http://revert-test.example",
    siteSecretCiphertext: encryptSiteSecret("test-site-secret", encryptionKey),
  });
  const { row: workOrder } = await issueWorkOrder(db, {
    siteId: site.id,
    action,
    target,
    risk: action === "deactivate_plugin" ? "medium" : "low",
    deadMansSwitchMs: 30_000,
    siteSecret: "secret",
  });
  await captureSnapshot(db, { siteId: site.id, workOrderId: workOrder.id });
  // No live plugin exists yet to move a work order through claimed ->
  // executed (that's Task A5b/A7) — set it directly, same pattern
  // work-orders.test.ts already uses for the "claimedButStale" case.
  await db.update(workOrders).set({ status: "executed" }).where(eq(workOrders.id, workOrder.id));
  return { site, workOrderId: workOrder.id };
}

describe("executeRevert", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues an inverse work order for an action with a clean mechanical inverse, marks reverted, and escalates", async () => {
    const { site, workOrderId } = await makeExecutedWorkOrder("deactivate_plugin", "some-plugin");

    const result = await executeRevert(workOrderId);

    expect(result.correctiveWorkOrderId).not.toBeNull();
    expect(result.snapshotId).not.toBeNull();
    expect(result.siteReachable).toBe(true);

    const reverted = await getWorkOrderById(db, workOrderId);
    expect(reverted?.status).toBe("reverted");

    const corrective = await getWorkOrderById(db, result.correctiveWorkOrderId!);
    expect(corrective?.action).toBe("activate_plugin");
    expect(corrective?.target).toBe("some-plugin");
    expect(corrective?.status).toBe("pending");

    const logs = await listAuditLogForSite(db, site.id);
    expect(logs.some((l) => l.eventType === "work_order_reverted" && l.workOrderId === workOrderId)).toBe(
      true,
    );
    expect(
      logs.some((l) => l.eventType === "revert_escalated_to_human" && l.workOrderId === workOrderId),
    ).toBe(true);
  });

  it("still marks reverted and escalates when no automatic inverse exists for the action", async () => {
    const { site, workOrderId } = await makeExecutedWorkOrder("flush_cache");

    const result = await executeRevert(workOrderId);

    expect(result.correctiveWorkOrderId).toBeNull();
    expect((await getWorkOrderById(db, workOrderId))?.status).toBe("reverted");

    const logs = await listAuditLogForSite(db, site.id);
    const revertLog = logs.find((l) => l.eventType === "work_order_reverted");
    expect(revertLog?.summary).toMatch(/no automatic inverse/i);
  });

  it("is a no-op on markWorkOrderReverted (returns undefined internally) for a work order that isn't 'executed'", async () => {
    const org = await createOrg(db, { name: "revert-test-not-executed-org" });
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://revert-test-not-executed.example",
      siteSecretCiphertext: "irrelevant",
    });
    const { row: workOrder } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
    });

    // Still pending, never executed — executeRevert should still run
    // (it's the caller's job, the dead-man's-switch fire task, to check
    // status before calling this) but the guarded UPDATE simply won't move
    // anything, leaving status as "pending".
    await executeRevert(workOrder.id);
    expect((await getWorkOrderById(db, workOrder.id))?.status).toBe("pending");
  });

  it("records siteReachable=false when the health probe fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const { workOrderId } = await makeExecutedWorkOrder("flush_cache");

    const result = await executeRevert(workOrderId);
    expect(result.siteReachable).toBe(false);
  });
});

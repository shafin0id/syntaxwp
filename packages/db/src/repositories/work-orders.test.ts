import { afterAll, describe, expect, it } from "vitest";
import { verifyWorkOrderSignature } from "@syntaxwp/shared";
import { db, sql } from "../client.js";
import { createOrg } from "./orgs.js";
import { createSite } from "./sites.js";
import { workOrders } from "../schema/index.js";
import { eq } from "drizzle-orm";
import {
  approveWorkOrder,
  claimNextPendingWorkOrder,
  declineWorkOrder,
  expireStaleWorkOrders,
  getWorkOrderById,
  getWorkOrderForOrg,
  issueWorkOrder,
  issueWorkOrderWithPolicy,
  markWorkOrderExecuted,
  workOrderToWirePayload,
} from "./work-orders.js";

// One shared `sql` connection (../client.js) across every describe block in
// this file — closing it must happen exactly once, after everything below
// has run, not per describe block (an early sql.end() left later blocks in
// this same file hitting CONNECTION_ENDED, since Vitest runs a file's
// describes sequentially in one shared module instance).
afterAll(async () => {
  await sql.end();
});

describe("work order issuance", () => {
  async function makeTestSite() {
    const org = await createOrg(db, { name: "work-order-test-org" });
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://work-order-test.example",
      siteSecretCiphertext: "irrelevant-not-decrypted-in-this-test",
    });
    return { site, orgId: org.id };
  }

  it("issues a work order with a signature that verifies against the wire payload", async () => {
    const { site } = await makeTestSite();
    const secret = "plaintext-secret-for-this-test";

    const { row, wirePayload } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: secret,
    });

    expect(row.id).toBe(wirePayload.id);
    expect(row.hmac).toBe(wirePayload.hmac);
    expect(verifyWorkOrderSignature(wirePayload, secret)).toBe(true);

    const fetched = await getWorkOrderById(db, row.id);
    expect(fetched?.status).toBe("pending");
  });

  it("rejects verification with the wrong secret", async () => {
    const { site } = await makeTestSite();
    const { wirePayload } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: "correct-secret",
    });
    expect(verifyWorkOrderSignature(wirePayload, "wrong-secret")).toBe(false);
  });

  it("expireStaleWorkOrders only moves pending+past-expiry orders to expired", async () => {
    const { site } = await makeTestSite();

    const { row: freshOrder } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
    });

    const { row: staleOrder } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
      expiresInMs: -1000, // already expired the moment it's issued
    });

    const { row: claimedButStale } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
      expiresInMs: -1000,
    });
    await db.update(workOrders).set({ status: "claimed" }).where(eq(workOrders.id, claimedButStale.id));

    const count = await expireStaleWorkOrders(db);
    expect(count).toBeGreaterThanOrEqual(1);

    expect((await getWorkOrderById(db, freshOrder.id))?.status).toBe("pending");
    expect((await getWorkOrderById(db, staleOrder.id))?.status).toBe("expired");
    // claimed orders are never touched by the expiry sweep, even past their
    // original claim-window expiry — expiry only closes the claim window.
    expect((await getWorkOrderById(db, claimedButStale.id))?.status).toBe("claimed");
  });
});

describe("issueWorkOrderWithPolicy", () => {
  async function makeTestSite() {
    const org = await createOrg(db, { name: "policy-issuance-test-org" });
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://policy-issuance-test.example",
      siteSecretCiphertext: "irrelevant",
    });
    return { site, orgId: org.id };
  }

  it("issues immediately-claimable ('pending') for a low-risk action under full_auto", async () => {
    const { site } = await makeTestSite();
    const result = await issueWorkOrderWithPolicy(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
      tier: "full_auto",
    });
    expect(result.decision).toBe("allow");
    expect(result.workOrder?.row.status).toBe("pending");
  });

  it("issues as 'awaiting_approval' for a medium-risk action under full_auto", async () => {
    const { site } = await makeTestSite();
    const result = await issueWorkOrderWithPolicy(db, {
      siteId: site.id,
      action: "deactivate_plugin",
      risk: "medium",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
      tier: "full_auto",
    });
    expect(result.decision).toBe("ask");
    expect(result.workOrder?.row.status).toBe("awaiting_approval");
  });

  it("never creates a row for a blocked action, regardless of tier", async () => {
    const { site } = await makeTestSite();
    const result = await issueWorkOrderWithPolicy(db, {
      siteId: site.id,
      action: "run_arbitrary_command",
      risk: "blocked",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
      tier: "full_auto",
    });
    expect(result.decision).toBe("block");
    expect(result.workOrder).toBeUndefined();
  });
});

describe("approveWorkOrder / declineWorkOrder / getWorkOrderForOrg", () => {
  async function makeAwaitingApprovalOrder() {
    const org = await createOrg(db, { name: "approval-flow-test-org" });
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://approval-flow-test.example",
      siteSecretCiphertext: "irrelevant",
    });
    const { workOrder } = await issueWorkOrderWithPolicy(db, {
      siteId: site.id,
      action: "deactivate_plugin",
      risk: "medium",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
      tier: "full_auto",
    });
    return { orgId: org.id, workOrderId: workOrder!.row.id };
  }

  it("approve moves awaiting_approval -> pending", async () => {
    const { workOrderId } = await makeAwaitingApprovalOrder();
    const updated = await approveWorkOrder(db, workOrderId);
    expect(updated?.status).toBe("pending");
  });

  it("decline moves awaiting_approval -> declined", async () => {
    const { workOrderId } = await makeAwaitingApprovalOrder();
    const updated = await declineWorkOrder(db, workOrderId);
    expect(updated?.status).toBe("declined");
  });

  it("approve is a no-op (returns undefined) on an order that isn't awaiting_approval", async () => {
    const { workOrderId } = await makeAwaitingApprovalOrder();
    await approveWorkOrder(db, workOrderId); // now "pending"
    const second = await approveWorkOrder(db, workOrderId);
    expect(second).toBeUndefined();
  });

  it("getWorkOrderForOrg returns undefined for a different org", async () => {
    const { workOrderId } = await makeAwaitingApprovalOrder();
    const otherOrg = await createOrg(db, { name: "approval-flow-test-other-org" });
    expect(await getWorkOrderForOrg(db, workOrderId, otherOrg.id)).toBeUndefined();
  });

  it("getWorkOrderForOrg returns the row for the owning org", async () => {
    const { orgId, workOrderId } = await makeAwaitingApprovalOrder();
    expect((await getWorkOrderForOrg(db, workOrderId, orgId))?.id).toBe(workOrderId);
  });
});

describe("claimNextPendingWorkOrder", () => {
  async function makeTestSite() {
    const org = await createOrg(db, { name: "claim-test-org" });
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://claim-test.example",
      siteSecretCiphertext: "irrelevant",
    });
    return site;
  }

  it("claims the oldest pending order for a site and returns undefined once it's empty", async () => {
    const site = await makeTestSite();
    const secret = "secret";
    const { row: older } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: secret,
    });
    const { row: newer } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: secret,
    });

    const first = await claimNextPendingWorkOrder(db, site.id);
    expect(first?.id).toBe(older.id);
    expect(first?.status).toBe("claimed");
    expect(first?.claimedAt).not.toBeNull();

    const second = await claimNextPendingWorkOrder(db, site.id);
    expect(second?.id).toBe(newer.id);

    expect(await claimNextPendingWorkOrder(db, site.id)).toBeUndefined();
  });

  it("never claims another site's pending order", async () => {
    const site = await makeTestSite();
    const otherSite = await makeTestSite();
    await issueWorkOrder(db, {
      siteId: otherSite.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
    });

    expect(await claimNextPendingWorkOrder(db, site.id)).toBeUndefined();
  });

  it("ignores awaiting_approval orders — only pending is claimable", async () => {
    const site = await makeTestSite();
    await issueWorkOrderWithPolicy(db, {
      siteId: site.id,
      action: "deactivate_plugin",
      risk: "medium",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
      tier: "full_auto",
    });

    expect(await claimNextPendingWorkOrder(db, site.id)).toBeUndefined();
  });
});

describe("workOrderToWirePayload", () => {
  it("reconstructs a payload whose signature verifies against the site secret", async () => {
    const org = await createOrg(db, { name: "wire-payload-test-org" });
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://wire-payload-test.example",
      siteSecretCiphertext: "irrelevant",
    });
    const secret = "wire-payload-secret";
    const { row } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      target: "all",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: secret,
    });

    const claimed = await claimNextPendingWorkOrder(db, site.id);
    const wirePayload = workOrderToWirePayload(claimed!);

    expect(wirePayload).toEqual({
      id: row.id,
      site_id: site.id,
      action: "flush_cache",
      target: "all",
      parameters: {},
      issued_at: Math.floor(row.issuedAt!.getTime() / 1000),
      expires_at: Math.floor(row.expiresAt.getTime() / 1000),
      dead_mans_switch_ms: 30_000,
      hmac: row.hmac,
    });
    expect(verifyWorkOrderSignature(wirePayload, secret)).toBe(true);
  });
});

describe("markWorkOrderExecuted", () => {
  async function makeClaimedOrder() {
    const org = await createOrg(db, { name: "mark-executed-test-org" });
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://mark-executed-test.example",
      siteSecretCiphertext: "irrelevant",
    });
    await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
    });
    const claimed = await claimNextPendingWorkOrder(db, site.id);
    return claimed!.id;
  }

  it("moves claimed -> executed and stores the result", async () => {
    const id = await makeClaimedOrder();
    const updated = await markWorkOrderExecuted(db, id, { success: true, action: "flush_cache" });

    expect(updated?.status).toBe("executed");
    expect(updated?.result).toEqual({ success: true, action: "flush_cache" });
    expect(updated?.executedAt).not.toBeNull();
  });

  it("stores a false-success result too — 'executed' means reported, not succeeded", async () => {
    const id = await makeClaimedOrder();
    const updated = await markWorkOrderExecuted(db, id, {
      success: false,
      reason: "not_implemented",
    });

    expect(updated?.status).toBe("executed");
    expect(updated?.result).toEqual({ success: false, reason: "not_implemented" });
  });

  it("is a no-op (returns undefined) on an order that isn't claimed", async () => {
    const org = await createOrg(db, { name: "mark-executed-not-claimed-org" });
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://mark-executed-not-claimed.example",
      siteSecretCiphertext: "irrelevant",
    });
    const { row } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
    });

    expect(await markWorkOrderExecuted(db, row.id, { success: true })).toBeUndefined();
  });

  it("cannot be reported twice", async () => {
    const id = await makeClaimedOrder();
    await markWorkOrderExecuted(db, id, { success: true });
    expect(await markWorkOrderExecuted(db, id, { success: true })).toBeUndefined();
  });
});

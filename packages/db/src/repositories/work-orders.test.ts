import { afterAll, describe, expect, it } from "vitest";
import { verifyWorkOrderSignature } from "@syntaxwp/shared";
import { db, sql } from "../client.js";
import { createOrg } from "./orgs.js";
import { createSite } from "./sites.js";
import { workOrders } from "../schema/index.js";
import { eq } from "drizzle-orm";
import {
  approveWorkOrder,
  declineWorkOrder,
  expireStaleWorkOrders,
  getWorkOrderById,
  getWorkOrderForOrg,
  issueWorkOrder,
  issueWorkOrderWithPolicy,
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

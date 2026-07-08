import { afterAll, describe, expect, it } from "vitest";
import { verifyWorkOrderSignature } from "@syntaxwp/shared";
import { db, sql } from "../client.js";
import { createOrg } from "./orgs.js";
import { createSite } from "./sites.js";
import { workOrders } from "../schema/index.js";
import { eq } from "drizzle-orm";
import { expireStaleWorkOrders, getWorkOrderById, issueWorkOrder } from "./work-orders.js";

describe("work order issuance", () => {
  afterAll(async () => {
    await sql.end();
  });

  async function makeTestSite() {
    const org = await createOrg(db, { name: "work-order-test-org" });
    return createSite(db, {
      orgId: org.id,
      url: "http://work-order-test.example",
      siteSecretCiphertext: "irrelevant-not-decrypted-in-this-test",
    });
  }

  it("issues a work order with a signature that verifies against the wire payload", async () => {
    const site = await makeTestSite();
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
    const site = await makeTestSite();
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
    const site = await makeTestSite();

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

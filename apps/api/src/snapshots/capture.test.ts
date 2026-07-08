import { afterAll, describe, expect, it } from "vitest";
import {
  db,
  sql,
  createOrg,
  createSite,
  issueWorkOrder,
  upsertPluginInventory,
  getSnapshotForWorkOrder,
} from "@syntaxwp/db";
import { captureSnapshot } from "./capture.js";

describe("captureSnapshot", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("captures the site's current plugin_inventory as the snapshot's active_plugins", async () => {
    const org = await createOrg(db, { name: "capture-test-org" });
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://capture-test.example",
      siteSecretCiphertext: "irrelevant",
    });
    await upsertPluginInventory(db, site.id, [
      { slug: "akismet", version: "5.3", active: true },
      { slug: "woocommerce", version: "9.1", active: false },
    ]);
    const { row: workOrder } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "deactivate_plugin",
      target: "akismet",
      risk: "medium",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
    });

    const snapshot = await captureSnapshot(db, { siteId: site.id, workOrderId: workOrder.id });

    expect(snapshot.activePlugins).toEqual(
      expect.arrayContaining([
        { slug: "akismet", version: "5.3", active: true },
        { slug: "woocommerce", version: "9.1", active: false },
      ]),
    );
    expect(snapshot.optionsChecksum).toBeNull();
    expect((await getSnapshotForWorkOrder(db, workOrder.id))?.id).toBe(snapshot.id);
  });

  it("captures an empty active_plugins array when the site has no recorded inventory yet", async () => {
    const org = await createOrg(db, { name: "capture-test-org-empty" });
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://capture-test-empty.example",
      siteSecretCiphertext: "irrelevant",
    });
    const { row: workOrder } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
    });

    const snapshot = await captureSnapshot(db, { siteId: site.id, workOrderId: workOrder.id });
    expect(snapshot.activePlugins).toEqual([]);
  });
});

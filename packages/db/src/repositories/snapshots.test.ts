import { afterAll, describe, expect, it } from "vitest";
import { db, sql } from "../client.js";
import { createOrg } from "./orgs.js";
import { createSite } from "./sites.js";
import { issueWorkOrder } from "./work-orders.js";
import {
  createSnapshot,
  deleteSnapshotsOlderThan,
  getSnapshotById,
  getSnapshotForWorkOrder,
} from "./snapshots.js";

afterAll(async () => {
  await sql.end();
});

async function makeTestSiteAndWorkOrder() {
  const org = await createOrg(db, { name: "snapshot-test-org" });
  const site = await createSite(db, {
    orgId: org.id,
    url: "http://snapshot-test.example",
    siteSecretCiphertext: "irrelevant",
  });
  const { row: workOrder } = await issueWorkOrder(db, {
    siteId: site.id,
    action: "deactivate_plugin",
    target: "some-plugin",
    risk: "medium",
    deadMansSwitchMs: 30_000,
    siteSecret: "secret",
  });
  return { site, workOrder };
}

describe("snapshots repository", () => {
  it("creates a snapshot and fetches it back by id and by work order", async () => {
    const { site, workOrder } = await makeTestSiteAndWorkOrder();
    const activePlugins = [{ slug: "some-plugin", version: "1.0.0", active: true }];

    const created = await createSnapshot(db, {
      siteId: site.id,
      workOrderId: workOrder.id,
      activePlugins,
    });

    expect((await getSnapshotById(db, created.id))?.id).toBe(created.id);
    expect((await getSnapshotForWorkOrder(db, workOrder.id))?.id).toBe(created.id);
  });

  it("getSnapshotForWorkOrder returns undefined when none exists", async () => {
    const { workOrder } = await makeTestSiteAndWorkOrder();
    expect(await getSnapshotForWorkOrder(db, workOrder.id)).toBeUndefined();
  });

  it("deleteSnapshotsOlderThan only removes snapshots older than the cutoff, returning the deleted rows", async () => {
    const { site, workOrder } = await makeTestSiteAndWorkOrder();
    const old = await createSnapshot(db, { siteId: site.id, workOrderId: workOrder.id });

    const { workOrder: recentWorkOrder } = await (async () => {
      const wo = await issueWorkOrder(db, {
        siteId: site.id,
        action: "flush_cache",
        risk: "low",
        deadMansSwitchMs: 30_000,
        siteSecret: "secret",
      });
      return { workOrder: wo.row };
    })();
    const recent = await createSnapshot(db, { siteId: site.id, workOrderId: recentWorkOrder.id });

    // Force the "old" row's created_at into the past — createSnapshot always
    // defaults to now(), so the retention boundary can't be exercised
    // without backdating one row directly.
    await sql`update snapshots set created_at = now() - interval '31 days' where id = ${old.id}`;

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deleted = await deleteSnapshotsOlderThan(db, cutoff);

    expect(deleted.map((r) => r.id)).toContain(old.id);
    expect(deleted.map((r) => r.id)).not.toContain(recent.id);
    expect(await getSnapshotById(db, old.id)).toBeUndefined();
    expect((await getSnapshotById(db, recent.id))?.id).toBe(recent.id);
  });
});

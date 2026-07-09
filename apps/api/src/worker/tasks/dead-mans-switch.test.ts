import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
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
import {
  _releaseWorkerUtilsForTests,
  armDeadMansSwitch,
  deadMansSwitchFire,
  disarmDeadMansSwitch,
} from "./dead-mans-switch.js";

afterAll(async () => {
  await _releaseWorkerUtilsForTests();
  await sql.end();
});

async function getScheduledJob(workOrderId: string) {
  const rows = await sql`select * from graphile_worker.jobs where key = ${`dms_${workOrderId}`}`;
  return rows[0];
}

async function makeTestSite() {
  const org = await createOrg(db, { name: "dms-test-org" });
  return createSite(db, {
    orgId: org.id,
    url: "http://dms-test.example",
    siteSecretCiphertext: "irrelevant",
  });
}

describe("armDeadMansSwitch / disarmDeadMansSwitch", () => {
  it("arm schedules a dead_mans_switch_fire job keyed by the work order id, roughly timeoutMs out", async () => {
    const site = await makeTestSite();
    const { row: workOrder } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 120_000,
      siteSecret: "secret",
    });

    const before = Date.now();
    await armDeadMansSwitch(workOrder.id, 120_000);

    const job = await getScheduledJob(workOrder.id);
    expect(job).toBeDefined();
    expect(job.task_identifier).toBe("dead_mans_switch_fire");
    const runAtMs = new Date(job.run_at).getTime();
    expect(runAtMs).toBeGreaterThanOrEqual(before + 119_000);
    expect(runAtMs).toBeLessThanOrEqual(before + 121_000);
  });

  it("disarm removes the scheduled job", async () => {
    const site = await makeTestSite();
    const { row: workOrder } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 120_000,
      siteSecret: "secret",
    });

    await armDeadMansSwitch(workOrder.id, 120_000);
    expect(await getScheduledJob(workOrder.id)).toBeDefined();

    await disarmDeadMansSwitch(workOrder.id);
    expect(await getScheduledJob(workOrder.id)).toBeUndefined();
  });

  it("disarming a work order that was never armed is a no-op, not an error", async () => {
    const site = await makeTestSite();
    const { row: workOrder } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 120_000,
      siteSecret: "secret",
    });
    await expect(disarmDeadMansSwitch(workOrder.id)).resolves.not.toThrow();
  });
});

describe("deadMansSwitchFire task", () => {
  it("reverts an 'executed' work order", async () => {
    const site = await makeTestSite();
    const { row: workOrder } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
    });
    await db.update(workOrders).set({ status: "executed" }).where(eq(workOrders.id, workOrder.id));

    await deadMansSwitchFire({ workOrderId: workOrder.id }, undefined as never);

    expect((await getWorkOrderById(db, workOrder.id))?.status).toBe("reverted");
    const logs = await listAuditLogForSite(db, site.id);
    expect(logs.some((l) => l.eventType === "dead_mans_switch_fired")).toBe(true);
    expect(logs.some((l) => l.eventType === "work_order_reverted")).toBe(true);
  });

  it("is a no-op for a work order that isn't 'executed' (e.g. a disarm won the race)", async () => {
    const site = await makeTestSite();
    const { row: workOrder } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
    });

    await deadMansSwitchFire({ workOrderId: workOrder.id }, undefined as never);
    expect((await getWorkOrderById(db, workOrder.id))?.status).toBe("pending");
  });

  it("is a no-op for an unknown work order id", async () => {
    await expect(
      deadMansSwitchFire({ workOrderId: "00000000-0000-0000-0000-000000000000" }, undefined as never),
    ).resolves.not.toThrow();
  });
});

import { afterAll, describe, expect, it } from "vitest";
import { db, sql, createOrg, createSite, getWorkOrderById, issueWorkOrder } from "@syntaxwp/db";
import { workOrderExpirySweep } from "./work-order-expiry-sweep.js";

// Integration test — needs a live local Postgres, same caveat as the other
// A2/A5a/A3 test suites (Task A8.2 wires this into CI).
describe("workOrderExpirySweep task", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("expires a stale pending work order when run as a Graphile Worker task", async () => {
    const org = await createOrg(db, { name: "expiry-sweep-task-test-org" });
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://expiry-sweep-task-test.example",
      siteSecretCiphertext: "irrelevant",
    });
    const { row } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: "secret",
      expiresInMs: -1000,
    });

    // Task's real signature is (payload, helpers) — this job ignores both.
    await workOrderExpirySweep(undefined, undefined as never);

    expect((await getWorkOrderById(db, row.id))?.status).toBe("expired");
  });
});

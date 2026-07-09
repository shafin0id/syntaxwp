import { afterAll, describe, expect, it } from "vitest";
import { db, sql, createOrg, createSite, insertAuditLog } from "@syntaxwp/db";
import { subscribeToSiteEvents, type SiteEvent } from "./site-events.js";

// Integration test — needs a live local Postgres with migration
// 0006_audit_log_notify_trigger.sql applied (`pnpm --filter @syntaxwp/db
// migrate`). Exercises the real pg_notify/LISTEN round-trip, not a mocked
// emitter — the trigger firing on a genuine INSERT is the thing this module
// depends on.
describe("subscribeToSiteEvents", () => {
  afterAll(async () => {
    await sql.end();
  });

  async function makeTestSite() {
    const org = await createOrg(db, { name: "site-events-test-org" });
    return createSite(db, {
      orgId: org.id,
      url: "http://site-events-test.example",
      siteSecretCiphertext: "irrelevant",
    });
  }

  it("delivers a NOTIFY fired by inserting an audit_log row to a subscriber for that site", async () => {
    const site = await makeTestSite();
    const received: SiteEvent[] = [];
    const unsubscribe = await subscribeToSiteEvents(site.id, (event) => {
      received.push(event);
    });

    await insertAuditLog(db, {
      siteId: site.id,
      eventType: "site_events_test",
      actor: "system",
      summary: "hello from the trigger",
    });

    await expect
      .poll(() => received.length, { timeout: 5000, interval: 25 })
      .toBeGreaterThan(0);

    expect(received[0]).toMatchObject({
      site_id: site.id,
      event_type: "site_events_test",
      summary: "hello from the trigger",
    });
    unsubscribe();
  });

  it("never delivers another site's event to this site's subscriber", async () => {
    const site = await makeTestSite();
    const otherSite = await makeTestSite();
    const received: SiteEvent[] = [];
    const unsubscribe = await subscribeToSiteEvents(site.id, (event) => {
      received.push(event);
    });

    await insertAuditLog(db, {
      siteId: otherSite.id,
      eventType: "site_events_test_other",
      actor: "system",
      summary: "not for you",
    });
    // Prove the trigger did fire (for the other site) before asserting this
    // subscriber stayed empty — otherwise a slow trigger would make this
    // test pass for the wrong reason.
    const otherReceived: SiteEvent[] = [];
    const otherUnsubscribe = await subscribeToSiteEvents(otherSite.id, (event) => {
      otherReceived.push(event);
    });
    await insertAuditLog(db, {
      siteId: otherSite.id,
      eventType: "site_events_test_other_2",
      actor: "system",
      summary: "still not for you",
    });
    await expect.poll(() => otherReceived.length, { timeout: 5000, interval: 25 }).toBeGreaterThan(0);

    expect(received).toHaveLength(0);
    unsubscribe();
    otherUnsubscribe();
  });

  it("stops delivering after unsubscribe", async () => {
    const site = await makeTestSite();
    const received: SiteEvent[] = [];
    const unsubscribe = await subscribeToSiteEvents(site.id, (event) => {
      received.push(event);
    });
    unsubscribe();

    await insertAuditLog(db, {
      siteId: site.id,
      eventType: "site_events_test_after_unsub",
      actor: "system",
      summary: "should not arrive",
    });
    // No positive event to poll for here, so just give the NOTIFY round-trip
    // a generous window to have arrived if it were (wrongly) going to.
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toHaveLength(0);
  });
});

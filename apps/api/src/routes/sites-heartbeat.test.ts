import { afterAll, describe, expect, it } from "vitest";
import { db, sql, createOrg, createSite, listPluginInventoryForSite, listAuditLogForSite } from "@syntaxwp/db";
import { encryptSiteSecret, generateSiteSecret, signPayload } from "@syntaxwp/shared";
import { createApp } from "../app.js";
import { env } from "../env.js";

// Integration test — needs a live local Postgres, same caveat as the other
// A2/A5a test suites: not yet wired into CI (Task A8.2).
describe("heartbeat/events routes", () => {
  const app = createApp();

  afterAll(async () => {
    await sql.end();
  });

  async function makeTestSite() {
    const org = await createOrg(db, { name: "heartbeat-test-org" });
    const plaintext = generateSiteSecret();
    const ciphertext = encryptSiteSecret(
      plaintext,
      Buffer.from(env.SITE_SECRET_ENCRYPTION_KEY, "base64"),
    );
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://heartbeat-test.example",
      siteSecretCiphertext: ciphertext,
    });
    return { site, secret: plaintext };
  }

  it("updates site version/path and upserts plugin inventory", async () => {
    const { site, secret } = await makeTestSite();
    const payload = {
      site_id: site.id,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: "hb-1",
      wp_version: "7.0.1",
      execution_path: "wp7_native",
      plugins: [{ slug: "woocommerce", version: "9.1.0", active: true }],
    };
    const hmac = signPayload(payload, secret);

    const res = await app.request(`/api/sites/${site.id}/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, hmac }),
    });

    expect(res.status).toBe(200);
    const inventory = await listPluginInventoryForSite(db, site.id);
    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({ slug: "woocommerce", version: "9.1.0", active: true });
  });

  it("upserts (not duplicates) plugin inventory across repeated heartbeats", async () => {
    const { site, secret } = await makeTestSite();
    for (const [i, version] of ["9.1.0", "9.1.1"].entries()) {
      const payload = {
        site_id: site.id,
        timestamp: Math.floor(Date.now() / 1000),
        nonce: `hb-repeat-${i}`,
        plugins: [{ slug: "woocommerce", version, active: true }],
      };
      const res = await app.request(`/api/sites/${site.id}/heartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, hmac: signPayload(payload, secret) }),
      });
      expect(res.status).toBe(200);
    }

    const inventory = await listPluginInventoryForSite(db, site.id);
    expect(inventory).toHaveLength(1);
    expect(inventory[0].version).toBe("9.1.1");
  });

  it("rejects a heartbeat whose URL :id doesn't match the signed site_id", async () => {
    const { site: siteA, secret: secretA } = await makeTestSite();
    const { site: siteB } = await makeTestSite();
    const payload = { site_id: siteA.id, timestamp: Math.floor(Date.now() / 1000), nonce: "hb-mismatch" };

    const res = await app.request(`/api/sites/${siteB.id}/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, hmac: signPayload(payload, secretA) }),
    });
    expect(res.status).toBe(400);
  });

  it("records events as audit_log rows with actor 'system'", async () => {
    const { site, secret } = await makeTestSite();
    const payload = {
      site_id: site.id,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: "ev-1",
      events: [
        { type: "checkout_payment_failed", payment_method: "stripe" },
        { type: "plugin_activated", summary: "Activated yoast-seo", slug: "yoast-seo" },
      ],
    };

    const res = await app.request(`/api/sites/${site.id}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, hmac: signPayload(payload, secret) }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: 2 });

    const rows = await listAuditLogForSite(db, site.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.actor === "system")).toBe(true);
    const failedCheckout = rows.find((r) => r.eventType === "checkout_payment_failed");
    expect(failedCheckout?.evidence).toMatchObject({ payment_method: "stripe" });
    const pluginActivated = rows.find((r) => r.eventType === "plugin_activated");
    expect(pluginActivated?.summary).toBe("Activated yoast-seo");
  });
});

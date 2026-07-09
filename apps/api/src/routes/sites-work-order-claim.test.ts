import { afterAll, describe, expect, it } from "vitest";
import {
  db,
  sql,
  createOrg,
  createSite,
  issueWorkOrder,
  issueWorkOrderWithPolicy,
  listAuditLogForSite,
} from "@syntaxwp/db";
import { encryptSiteSecret, generateSiteSecret, signPayload, verifyWorkOrderSignature } from "@syntaxwp/shared";
import { createApp } from "../app.js";
import { env } from "../env.js";

// Integration test — needs a live local Postgres, same caveat as
// sites-heartbeat.test.ts. Exercises A5b.1's discover-and-claim endpoint: the
// legacy plugin path can't be told a work order's id ahead of time (it's
// outbound-only, §4.1), so claiming is "give me your oldest pending order",
// not "claim order X".
describe("POST /api/sites/:id/work-orders/claim", () => {
  const app = createApp();

  afterAll(async () => {
    await sql.end();
  });

  async function makeTestSite() {
    const org = await createOrg(db, { name: "claim-route-test-org" });
    const plaintext = generateSiteSecret();
    const ciphertext = encryptSiteSecret(
      plaintext,
      Buffer.from(env.SITE_SECRET_ENCRYPTION_KEY, "base64"),
    );
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://claim-route-test.example",
      siteSecretCiphertext: ciphertext,
    });
    return { site, secret: plaintext };
  }

  function signedClaimBody(siteId: string, secret: string, nonce: string) {
    const payload = { site_id: siteId, timestamp: Math.floor(Date.now() / 1000), nonce };
    return { ...payload, hmac: signPayload(payload, secret) };
  }

  it("claims the oldest pending work order and returns a signature-verifiable wire payload", async () => {
    const { site, secret } = await makeTestSite();
    const { row } = await issueWorkOrder(db, {
      siteId: site.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: secret,
    });

    const res = await app.request(`/api/sites/${site.id}/work-orders/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signedClaimBody(site.id, secret, "claim-1")),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; workOrder: Record<string, unknown> };
    expect(body.workOrder.id).toBe(row.id);
    expect(verifyWorkOrderSignature(body.workOrder as never, secret)).toBe(true);

    const logs = await listAuditLogForSite(db, site.id);
    expect(logs.some((l) => l.eventType === "work_order_claimed" && l.workOrderId === row.id)).toBe(
      true,
    );
  });

  it("returns 404 when the site has nothing pending", async () => {
    const { site, secret } = await makeTestSite();
    const res = await app.request(`/api/sites/${site.id}/work-orders/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signedClaimBody(site.id, secret, "claim-empty")),
    });
    expect(res.status).toBe(404);
  });

  it("never claims an order still awaiting dashboard approval", async () => {
    const { site, secret } = await makeTestSite();
    await issueWorkOrderWithPolicy(db, {
      siteId: site.id,
      action: "deactivate_plugin",
      risk: "medium",
      deadMansSwitchMs: 30_000,
      siteSecret: secret,
      tier: "full_auto",
    });

    const res = await app.request(`/api/sites/${site.id}/work-orders/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signedClaimBody(site.id, secret, "claim-awaiting")),
    });
    expect(res.status).toBe(404);
  });

  it("never claims another site's pending order, even with a valid signature for this site", async () => {
    const { site, secret } = await makeTestSite();
    const { site: otherSite, secret: otherSecret } = await makeTestSite();
    await issueWorkOrder(db, {
      siteId: otherSite.id,
      action: "flush_cache",
      risk: "low",
      deadMansSwitchMs: 30_000,
      siteSecret: otherSecret,
    });

    const res = await app.request(`/api/sites/${site.id}/work-orders/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signedClaimBody(site.id, secret, "claim-cross-site")),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a claim whose signature doesn't match the site's secret", async () => {
    const { site } = await makeTestSite();
    const res = await app.request(`/api/sites/${site.id}/work-orders/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signedClaimBody(site.id, "wrong-secret", "claim-badsig")),
    });
    expect(res.status).toBe(401);
  });
});

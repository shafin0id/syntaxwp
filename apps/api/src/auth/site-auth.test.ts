import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import { db, sql, createOrg, createSite } from "@syntaxwp/db";
import { encryptSiteSecret, generateSiteSecret, signPayload } from "@syntaxwp/shared";
import { env } from "../env.js";
import { verifySiteAuth, type SiteAuthVariables } from "./site-auth.js";

// Integration test — needs a live local Postgres (`supabase start`), same
// caveat as packages/db's tests: not yet wired into CI (Task A8.2).
describe("verifySiteAuth", () => {
  afterAll(async () => {
    await sql.end();
  });

  async function makeTestSite() {
    const org = await createOrg(db, { name: "site-auth-test-org" });
    const plaintext = generateSiteSecret();
    const ciphertext = encryptSiteSecret(plaintext, Buffer.from(env.SITE_SECRET_ENCRYPTION_KEY, "base64"));
    const site = await createSite(db, {
      orgId: org.id,
      url: "http://site-auth-test.example",
      siteSecretCiphertext: ciphertext,
    });
    return { site, secret: plaintext };
  }

  function buildApp() {
    return new Hono<{ Variables: SiteAuthVariables }>().post("/test", verifySiteAuth, (c) =>
      c.json({ ok: true, siteId: c.get("site").id }),
    );
  }

  it("accepts a correctly-signed request", async () => {
    const { site, secret } = await makeTestSite();
    const app = buildApp();
    const payload = { site_id: site.id, timestamp: Math.floor(Date.now() / 1000), nonce: "n-1" };
    const hmac = signPayload(payload, secret);

    const res = await app.request("/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, hmac }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, siteId: site.id });
  });

  it("rejects a tampered signature", async () => {
    const { site, secret } = await makeTestSite();
    const app = buildApp();
    const payload = { site_id: site.id, timestamp: Math.floor(Date.now() / 1000), nonce: "n-2" };
    const hmac = signPayload(payload, secret);

    const res = await app.request("/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, healthScore: 99, hmac }), // extra field not covered by hmac
    });

    expect(res.status).toBe(401);
  });

  it("rejects an unknown site_id", async () => {
    const app = buildApp();
    const payload = {
      site_id: "00000000-0000-0000-0000-000000000000",
      timestamp: Math.floor(Date.now() / 1000),
      nonce: "n-3",
    };
    const res = await app.request("/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, hmac: signPayload(payload, "wrong-secret") }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a stale timestamp", async () => {
    const { site, secret } = await makeTestSite();
    const app = buildApp();
    const payload = { site_id: site.id, timestamp: Math.floor(Date.now() / 1000) - 600, nonce: "n-4" };
    const hmac = signPayload(payload, secret);

    const res = await app.request("/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, hmac }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a replayed nonce on the second request", async () => {
    const { site, secret } = await makeTestSite();
    const app = buildApp();
    const payload = { site_id: site.id, timestamp: Math.floor(Date.now() / 1000), nonce: "n-5" };
    const hmac = signPayload(payload, secret);
    const body = JSON.stringify({ ...payload, hmac });

    const first = await app.request("/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(first.status).toBe(200);

    const second = await app.request("/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(second.status).toBe(401);
  });
});

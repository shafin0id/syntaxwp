import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { env } from "../env.js";
import { supabaseAdmin } from "../auth/supabase.js";
import { db, sql, createOrg } from "@syntaxwp/db";

// Integration test — needs a live local Supabase stack (`supabase start`),
// same caveat as the other A2/A5a.1 test suites: not yet wired into CI
// (Task A8.2). Exercises requireSession + getOrgIdFromUser end-to-end
// against a real Supabase Auth user, not a mock, since the whole point of
// this route pair is proving the session->org_id->site-ownership chain.
describe("sites routes", () => {
  const app = createApp();
  let accessToken: string;
  let orgId: string;
  let otherOrgId: string;
  const email = `sites-test-${randomUUID()}@syntaxwp.local`;
  const password = "test-password-12345";

  beforeAll(async () => {
    const org = await createOrg(db, { name: "sites-route-test-org" });
    orgId = org.id;
    const otherOrg = await createOrg(db, { name: "sites-route-test-other-org" });
    otherOrgId = otherOrg.id;

    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { org_id: orgId },
    });
    if (createErr) throw createErr;

    const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw error ?? new Error("no session returned");
    accessToken = data.session.access_token;
  });

  afterAll(async () => {
    await sql.end();
  });

  it("creates a site under the caller's org and returns the plaintext secret once", async () => {
    const res = await app.request("/api/sites", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.siteSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(body.siteSecretCiphertext).toBeUndefined();
    expect(body.url).toBe("https://example.com");
  });

  it("rejects an unauthenticated request", async () => {
    const res = await app.request("/api/sites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid body", async () => {
    const res = await app.request("/api/sites", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ url: "not-a-url" }),
    });
    expect(res.status).toBe(400);
  });

  it("fetches a site the caller's org owns", async () => {
    const createRes = await app.request("/api/sites", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ url: "https://fetch-me.example.com" }),
    });
    const created = (await createRes.json()) as Record<string, unknown>;

    const res = await app.request(`/api/sites/${created.id}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(created.id);
    expect(body.siteSecretCiphertext).toBeUndefined();
    expect(body.siteSecret).toBeUndefined();
  });

  it("returns 404 for a site owned by a different org", async () => {
    const { createSite } = await import("@syntaxwp/db");
    const otherSite = await createSite(db, {
      orgId: otherOrgId,
      url: "https://not-yours.example.com",
      siteSecretCiphertext: "irrelevant",
    });

    const res = await app.request(`/api/sites/${otherSite.id}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(404);
  });
});

import { Hono } from "hono";
import { createHash } from "node:crypto";
import { db } from "@syntaxwp/db";
import { sites, incidents } from "@syntaxwp/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { estimateRevenueLoss, decryptSiteSecret, loadSiteSecretEncryptionKey } from "@syntaxwp/shared";
import { env } from "../env.js";

const encryptionKey = loadSiteSecretEncryptionKey(env.SITE_SECRET_ENCRYPTION_KEY);

function incidentFingerprint(siteId: string, type: string, message: string): string {
  const normalized = message.replace(/\d+/g, "#").trim().toLowerCase();
  return `${siteId}_${createHash("sha256").update(`${type}:${normalized}`).digest("hex")}`;
}

const AnomalySchema = z.object({
  site_id: z.string().uuid(),
  type: z.enum(["wsod", "perf_regression", "plugin_conflict", "php_fatal"]),
  severity: z.enum(["high", "medium", "low"]),
  root_cause: z.string().max(500),
  plain_english: z.string().max(2000),
  confidence: z.number().min(0).max(1),
});

const FailedCheckoutSchema = z.object({
  site_id: z.string().uuid(),
  error_message: z.string().max(2000),
});

const WooHookSchema = z.object({
  site_id: z.string().uuid(),
  event: z.string().max(200),
  data: z.record(z.unknown()).optional(),
});

// Helper to authenticate sites
async function authenticateSite(c: any, siteId: string): Promise<any | null> {
  const secretHeader = c.req.header("X-Site-Secret") || c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!secretHeader) return null;

  const [site] = await db
    .select()
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);

  if (site) {
    try {
      const secret = decryptSiteSecret(site.siteSecretCiphertext, encryptionKey);
      if (secret === secretHeader) {
        return site;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export const ingestionRoute = new Hono()
  .get("/api/probes/sites", async (c) => {
    try {
      const authHeader = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
      if (!authHeader || authHeader !== env.CF_WORKER_SECRET) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const activeSites = await db
        .select({
          id: sites.id,
          url: sites.url,
        })
        .from(sites);
      return c.json(activeSites);
    } catch (err: any) {
      console.error("Failed to fetch probe sites:", err.message);
      return c.json({ error: "Internal server error" }, 500);
    }
  })
  .post("/api/probes/anomaly", async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch (err) {
      return c.json({ error: "Malformed JSON payload" }, 400);
    }

    const parsed = AnomalySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
    }

    const { site_id, type, severity, root_cause, plain_english, confidence } = parsed.data;

    // Verify site and secret
    const site = await authenticateSite(c, site_id);
    if (!site) {
      return c.json({ error: "Site not found or invalid authorization" }, 401);
    }

    try {
      const fingerprint = incidentFingerprint(site_id, type, `${root_cause}:${plain_english}`);

      // wsod and php_fatal should be server class, perf_regression is performance, plugin_conflict is client
      let incidentClass = "client";
      if (type === "wsod" || type === "php_fatal") {
        incidentClass = "server";
      } else if (type === "perf_regression") {
        incidentClass = "performance";
      }

      const [newIncident] = await db
        .insert(incidents)
        .values({
          siteId: site_id,
          fingerprint,
          type,
          severity,
          status: "open",
          class: incidentClass,
          rootCause: root_cause,
          plainEnglish: plain_english,
          confidence,
        })
        .onConflictDoNothing()
        .returning();

      if (!newIncident) {
        const [existing] = await db.select().from(incidents).where(eq(incidents.fingerprint, fingerprint)).limit(1);
        if (existing?.status === "resolved") {
          await db.update(incidents).set({ status: "open", resolvedAt: null, detectedAt: new Date() }).where(eq(incidents.id, existing.id));
          await db.execute(sql`SELECT graphile_worker.add_job('fix_pipeline', json_build_object('incidentId', ${existing.id}::text))`);
          return c.json({ status: "reopened", id: existing.id }, 200);
        }
        return c.json({ status: "ignored", message: "Matching incident already active" }, 200);
      }

      // Trigger automated diagnostics and fix pipeline
      await db.execute(sql`SELECT graphile_worker.add_job('fix_pipeline', json_build_object('incidentId', ${newIncident.id}::text))`);

      console.log(`Logged new incident: ${newIncident.id} (${type})`);
      return c.json({ status: "created", id: newIncident.id }, 201);
    } catch (err: any) {
      console.error("Anomaly ingestion error:", err.message);
      return c.json({ error: "Internal server error" }, 500);
    }
  })
  .post("/api/sites/woocommerce/failed-checkout", async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch (err) {
      return c.json({ error: "Malformed JSON payload" }, 400);
    }

    const parsed = FailedCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
    }

    const { site_id, error_message } = parsed.data;

    // Verify site and secret
    const site = await authenticateSite(c, site_id);
    if (!site) {
      return c.json({ error: "Site not found or invalid authorization" }, 401);
    }

    try {
      // Estimate revenue loss assuming a 10-minute window
      const loss = estimateRevenueLoss(site.avgOrderValue ?? 79, 10, new Date());

      const fingerprint = incidentFingerprint(site_id, "checkout_failure", error_message);

      const [newIncident] = await db
        .insert(incidents)
        .values({
          siteId: site_id,
          fingerprint,
          type: "checkout_failure",
          severity: "medium",
          status: "open",
          class: "client",
          rootCause: "WooCommerce checkout submission failure",
          plainEnglish: `${error_message}. Estimated revenue loss: $${loss}.`,
          confidence: 0.99,
        })
        .onConflictDoNothing()
        .returning();

      if (!newIncident) {
        const [existing] = await db.select().from(incidents).where(eq(incidents.fingerprint, fingerprint)).limit(1);
        if (existing?.status === "resolved") {
          await db.update(incidents).set({ status: "open", resolvedAt: null, detectedAt: new Date() }).where(eq(incidents.id, existing.id));
          await db.execute(sql`SELECT graphile_worker.add_job('fix_pipeline', json_build_object('incidentId', ${existing.id}::text))`);
          return c.json({ status: "reopened", id: existing.id }, 200);
        }
        return c.json({ status: "ignored", message: "Matching incident already active" }, 200);
      }

      // Trigger automated diagnostics and fix pipeline
      await db.execute(sql`SELECT graphile_worker.add_job('fix_pipeline', json_build_object('incidentId', ${newIncident.id}::text))`);

      console.log(`Logged new checkout incident: ${newIncident.id}`);
      return c.json({ status: "created", id: newIncident.id }, 201);
    } catch (err: any) {
      console.error("Failed checkout ingestion error:", err.message);
      return c.json({ error: "Internal server error" }, 500);
    }
  })
  .post("/api/sites/woocommerce/hooks", async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch (err) {
      return c.json({ error: "Malformed JSON payload" }, 400);
    }

    const parsed = WooHookSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
    }

    const { site_id: siteId, event, data = {} } = parsed.data;

    // Verify site and secret
    const site = await authenticateSite(c, siteId);
    if (!site) {
      return c.json({ error: "Site not found or invalid authorization" }, 401);
    }

    try {
      // Sanitize log logging
      const safeEvent = event.replace(/[\r\n\t]/g, " ");
      console.log(`[WooCommerce Webhook] Site: ${site.url} | Event: ${safeEvent} | Order ID: ${data.order_id || "none"}`);
      return c.json({ status: "received" }, 200);
    } catch (err: any) {
      console.error("WooCommerce webhook error:", err.message);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

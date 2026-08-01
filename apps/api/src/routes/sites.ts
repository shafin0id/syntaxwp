import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  db,
  createSite,
  claimNextPendingWorkOrder,
  getSiteByIdForOrg,
  recordHeartbeat,
  upsertPluginInventory,
  insertAuditLog,
  workOrderToWirePayload,
  incidents,
  type Site,
} from "@syntaxwp/db";
import { sql, eq } from "drizzle-orm";
import { encryptSiteSecret, generateSiteSecret, loadSiteSecretEncryptionKey } from "@syntaxwp/shared";
import { env } from "../env.js";
import { requireSession, getOrgIdFromUser, type SessionVariables } from "../auth/middleware.js";
import { verifySiteAuth, type SiteAuthVariables } from "../auth/site-auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { subscribeToSiteEvents } from "../realtime/site-events.js";

// §10.3's keep-alive cadence — long enough not to spam an idle connection,
// short enough that a dead connection (proxy silently dropped it) is
// noticed well within a dashboard user's patience.
const SSE_PING_INTERVAL_MS = 30_000;

const encryptionKey = loadSiteSecretEncryptionKey(env.SITE_SECRET_ENCRYPTION_KEY);

function incidentFingerprint(siteId: string, type: string, summary: string, evidence: Record<string, unknown>): string {
  const signature = JSON.stringify({
    type,
    summary: summary.replace(/\d+/g, "#").trim().toLowerCase(),
    file: evidence.file ?? null,
    line: evidence.line ?? null,
  });
  return `${siteId}_${createHash("sha256").update(signature).digest("hex")}`;
}

const CreateSiteSchema = z.object({
  url: z.string().url(),
  stagingUrl: z.string().url().optional(),
  wpVersion: z.string().optional(),
  executionPath: z.enum(["wp7_native", "legacy_outbound"]).optional(),
  permissionTier: z.enum(["full_auto", "some_access", "manual"]).optional(),
  wooEnabled: z.boolean().optional(),
});

// §4.3's heartbeat payload has far more fields (theme, php_version,
// db_size_mb, active_users_online, health.*) than this system has columns
// or a use for yet — those belong to Track B's performance/analytics work
// (B10) once it lands. This only extracts what A5a.2b actually persists:
// the site's own version/path fields and its plugin list.
const HeartbeatSchema = z.object({
  wp_version: z.string().optional(),
  available_wp_version: z.string().nullable().optional(),
  execution_path: z.enum(["wp7_native", "legacy_outbound"]).optional(),
  site_title: z.string().optional(),
  plugins: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string().optional(),
        version: z.string().optional(),
        active: z.boolean().optional(),
        update_available: z.boolean().optional(),
        update_version: z.string().nullable().optional(),
      }),
    )
    .optional(),
  themes: z
    .array(
      z.object({
        name: z.string(),
        slug: z.string(),
        current: z.string(),
        latest: z.string(),
        status: z.enum(["active", "inactive"]),
        description: z.string().optional(),
        update_available: z.boolean().optional(),
      }),
    )
    .optional(),
});

// Mirrors §11.2's SyntaxWP_EventQueue::push() shape — a batch of arbitrary
// typed lifecycle events (plugin change, WooCommerce checkout events, etc.).
// Stored as audit_log rows: these are real things that happened on the site
// (actor: 'system', since the plugin reports them, not a dashboard user),
// which is exactly what the append-only audit trail is for — distinct from
// heartbeats, which are routine 60s telemetry, not events.
const EventsSchema = z.object({
  events: z.array(
    z.object({
      type: z.string(),
      summary: z.string().optional(),
    }).passthrough(),
  ),
});

// Never serializes site_secret_ciphertext — it's not decryptable by anything
// other than apps/api itself and has no business leaving this process except
// as the one-time plaintext returned by POST /api/sites below.
function serializeSite(site: Site) {
  const { siteSecretCiphertext: _omit, ...rest } = site;
  return rest;
}

export const sitesRoutes = new Hono<{ Variables: SessionVariables & SiteAuthVariables }>()
  .post("/", requireSession, async (c) => {
    const orgId = getOrgIdFromUser(c.get("user"));
    if (!orgId) {
      return c.json({ error: "user has no associated org" }, 403);
    }

    const parsed = CreateSiteSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
    }

    const siteSecret = generateSiteSecret();
    const site = await createSite(db, {
      orgId,
      url: parsed.data.url,
      stagingUrl: parsed.data.stagingUrl,
      wpVersion: parsed.data.wpVersion,
      executionPath: parsed.data.executionPath,
      permissionTier: parsed.data.permissionTier,
      wooEnabled: parsed.data.wooEnabled,
      siteSecretCiphertext: encryptSiteSecret(siteSecret, encryptionKey),
    });

    // Show-once pattern, like an API key: this is the only response that
    // will ever contain the plaintext secret. The plugin installer/setup
    // flow is responsible for capturing it here and configuring the plugin
    // with it — there's no "forgot my secret" recovery, only reprovisioning.
    return c.json({ ...serializeSite(site), siteSecret }, 201);
  })
  .get("/:id", requireSession, async (c) => {
    const orgId = getOrgIdFromUser(c.get("user"));
    if (!orgId) {
      return c.json({ error: "user has no associated org" }, 403);
    }

    const site = await getSiteByIdForOrg(db, c.req.param("id"), orgId);
    if (!site) {
      return c.json({ error: "site not found" }, 404);
    }

    return c.json(serializeSite(site));
  })
  .get("/:id/stream", requireSession, async (c) => {
    const orgId = getOrgIdFromUser(c.get("user"));
    if (!orgId) {
      return c.json({ error: "user has no associated org" }, 403);
    }

    const site = await getSiteByIdForOrg(db, c.req.param("id"), orgId);
    if (!site) {
      return c.json({ error: "site not found" }, 404);
    }

    // Same architecture as §10.3's reference implementation: one background
    // ping loop keeps the connection alive (some proxies/load balancers
    // close idle connections), while the NOTIFY-fed subscription callback
    // pushes real events independently as they arrive — both write to the
    // same stream from different points in time, never concurrently in
    // practice at this traffic volume.
    return streamSSE(c, async (stream) => {
      const unsubscribe = await subscribeToSiteEvents(site.id, (event) => {
        void stream.writeSSE({
          data: JSON.stringify(event),
          event: event.event_type,
          id: event.id,
        });
      });
      stream.onAbort(() => {
        unsubscribe();
      });

      while (!stream.aborted) {
        await stream.writeSSE({ data: "", event: "ping" });
        await stream.sleep(SSE_PING_INTERVAL_MS);
      }
      unsubscribe();
    });
  })
  .post(
    "/:id/heartbeat",
    verifySiteAuth,
    rateLimit<{ Variables: SessionVariables & SiteAuthVariables }>("heartbeat", (c) => c.get("site").id),
    async (c) => {
      const site = c.get("site");
      if (c.req.param("id") !== site.id) {
        return c.json({ error: "site_id in body does not match :id in URL" }, 400);
      }

      console.log("HEARTBEAT RECVD"); const parsed = HeartbeatSchema.safeParse(c.get("siteAuthPayload"));
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
      }

      await recordHeartbeat(db, site.id, {
        wpVersion: parsed.data.wp_version,
        availableWpVersion: parsed.data.available_wp_version,
        executionPath: parsed.data.execution_path,
        themes: parsed.data.themes || [],
        title: parsed.data.site_title,
      });
      if (parsed.data.plugins) {
        await upsertPluginInventory(db, site.id, parsed.data.plugins);
      }

      return c.json({ ok: true });
    },
  )
  .post(
    "/:id/events",
    verifySiteAuth,
    rateLimit<{ Variables: SessionVariables & SiteAuthVariables }>("events", (c) => c.get("site").id),
    async (c) => {
      const site = c.get("site");
      if (c.req.param("id") !== site.id) {
        return c.json({ error: "site_id in body does not match :id in URL" }, 400);
      }

      const parsed = EventsSchema.safeParse(c.get("siteAuthPayload"));
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
      }

      for (const event of parsed.data.events) {
        const { type, summary, ...evidence } = event;
        await insertAuditLog(db, {
          siteId: site.id,
          eventType: type,
          actor: "system",
          summary: summary ?? `Plugin-reported event: ${type}`,
          evidence,
        });

        if (type === "fatal_error" || type === "php_fatal") {
          const fingerprint = incidentFingerprint(site.id, type, summary ?? "", evidence);

          const [existing] = await db
            .select()
            .from(incidents)
            .where(eq(incidents.fingerprint, fingerprint))
            .limit(1);

          if (existing) {
            if (existing.status === "resolved") {
              await db
                .update(incidents)
                .set({
                  status: "open",
                  resolvedAt: null,
                  detectedAt: new Date(),
                })
                .where(eq(incidents.id, existing.id));

              await db.execute(sql`SELECT graphile_worker.add_job('fix_pipeline', json_build_object('incidentId', ${existing.id}::text))`);
              console.log(`Reopened resolved incident from plugin event: ${existing.id} (php_fatal)`);
            } else {
              console.log(`Incident with fingerprint ${fingerprint} already active with status: ${existing.status}`);
            }
          } else {
            const [newIncident] = await db
              .insert(incidents)
              .values({
                siteId: site.id,
                fingerprint,
                type: "php_fatal",
                severity: "high",
                status: "open",
                class: "server",
                rootCause: "PHP Fatal Error Captured by Plugin",
                plainEnglish: summary || "A critical error has occurred on the website.",
                confidence: 0.99,
              })
              .returning();

            if (newIncident) {
              await db.execute(sql`SELECT graphile_worker.add_job('fix_pipeline', json_build_object('incidentId', ${newIncident.id}::text))`);
              console.log(`Logged new incident from plugin event: ${newIncident.id} (php_fatal)`);
            }
          }
        }
      }

      return c.json({ ok: true, recorded: parsed.data.events.length });
    },
  )
  .post(
    "/:id/work-orders/claim",
    verifySiteAuth,
    rateLimit<{ Variables: SessionVariables & SiteAuthVariables }>("work_claims", (c) =>
      c.get("site").id,
    ),
    async (c) => {
      const site = c.get("site");
      if (c.req.param("id") !== site.id) {
        return c.json({ error: "site_id in body does not match :id in URL" }, 400);
      }

      // Discover-and-claim in one atomic statement (see
      // claimNextPendingWorkOrder's comment) — the legacy plugin path is
      // outbound-only (§4.1), so it has no way to know a work order's id
      // ahead of a poll; there's nothing to discover separately.
      const claimed = await claimNextPendingWorkOrder(db, site.id);
      if (!claimed) {
        return c.json({ error: "no pending work order" }, 404);
      }

      await insertAuditLog(db, {
        siteId: claimed.siteId,
        workOrderId: claimed.id,
        incidentId: claimed.incidentId,
        eventType: "work_order_claimed",
        actor: "system",
        summary: `Claimed ${claimed.action} (${claimed.risk} risk)`,
      });

      return c.json({ ok: true, workOrder: workOrderToWirePayload(claimed) });
    },
  );

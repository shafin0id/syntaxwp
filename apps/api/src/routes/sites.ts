import { Hono } from "hono";
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
  type Site,
} from "@syntaxwp/db";
import { encryptSiteSecret, generateSiteSecret, loadSiteSecretEncryptionKey } from "@syntaxwp/shared";
import { env } from "../env.js";
import { requireSession, getOrgIdFromUser, type SessionVariables } from "../auth/middleware.js";
import { verifySiteAuth, type SiteAuthVariables } from "../auth/site-auth.js";
import { rateLimit } from "../middleware/rate-limit.js";

const encryptionKey = loadSiteSecretEncryptionKey(env.SITE_SECRET_ENCRYPTION_KEY);

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
  execution_path: z.enum(["wp7_native", "legacy_outbound"]).optional(),
  plugins: z
    .array(
      z.object({
        slug: z.string(),
        version: z.string().optional(),
        active: z.boolean().optional(),
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
  .post(
    "/:id/heartbeat",
    verifySiteAuth,
    rateLimit<{ Variables: SessionVariables & SiteAuthVariables }>("heartbeat", (c) => c.get("site").id),
    async (c) => {
      const site = c.get("site");
      if (c.req.param("id") !== site.id) {
        return c.json({ error: "site_id in body does not match :id in URL" }, 400);
      }

      const parsed = HeartbeatSchema.safeParse(c.get("siteAuthPayload"));
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
      }

      await recordHeartbeat(db, site.id, {
        wpVersion: parsed.data.wp_version,
        executionPath: parsed.data.execution_path,
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

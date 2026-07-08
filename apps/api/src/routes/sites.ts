import { Hono } from "hono";
import { z } from "zod";
import { db, createSite, getSiteByIdForOrg, type Site } from "@syntaxwp/db";
import { encryptSiteSecret, generateSiteSecret, loadSiteSecretEncryptionKey } from "@syntaxwp/shared";
import { env } from "../env.js";
import { requireSession, getOrgIdFromUser, type SessionVariables } from "../auth/middleware.js";

const encryptionKey = loadSiteSecretEncryptionKey(env.SITE_SECRET_ENCRYPTION_KEY);

const CreateSiteSchema = z.object({
  url: z.string().url(),
  stagingUrl: z.string().url().optional(),
  wpVersion: z.string().optional(),
  executionPath: z.enum(["wp7_native", "legacy_outbound"]).optional(),
  permissionTier: z.enum(["full_auto", "some_access", "manual"]).optional(),
  wooEnabled: z.boolean().optional(),
});

// Never serializes site_secret_ciphertext — it's not decryptable by anything
// other than apps/api itself and has no business leaving this process except
// as the one-time plaintext returned by POST /api/sites below.
function serializeSite(site: Site) {
  const { siteSecretCiphertext: _omit, ...rest } = site;
  return rest;
}

export const sitesRoutes = new Hono<{ Variables: SessionVariables }>()
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
  });

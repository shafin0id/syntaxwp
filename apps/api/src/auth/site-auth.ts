import type { MiddlewareHandler } from "hono";
import { db, getSiteById, recordNonceIfUnused, type Site } from "@syntaxwp/db";
import { decryptSiteSecret, loadSiteSecretEncryptionKey, verifySignature } from "@syntaxwp/shared";
import { env } from "../env.js";

export type SiteAuthVariables = {
  site: Site;
  siteAuthPayload: Record<string, unknown>;
};

// Same 5-minute window as work orders' expiry (§8.2) for consistency — a
// plugin's clock can drift, but not by more than this without other
// problems (heartbeat cadence, WP-Cron reliability) becoming visible first.
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

// Loaded once at module init, not per-request — a misconfigured key should
// fail the process at boot, not surface as a confusing per-request 401.
const encryptionKey = loadSiteSecretEncryptionKey(env.SITE_SECRET_ENCRYPTION_KEY);

// Authenticates plugin-originated requests (heartbeat, events — A5a.2b).
// Distinct from requireSession (dashboard-originated, user-session auth):
// the plugin has no user session, it proves identity by signing the request
// body with the site_secret it was issued at provisioning time.
//
// Expected body shape: { site_id, timestamp, nonce, hmac, ...rest }, where
// `timestamp` is Unix seconds and `hmac` signs everything else in the body
// via canonicalizeForSigning/signPayload (packages/shared/src/hmac.ts) — the
// same signing scheme work orders use (A3.1), just over a different payload.
export const verifySiteAuth: MiddlewareHandler<{ Variables: SiteAuthVariables }> = async (
  c,
  next,
) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return c.json({ error: "missing or malformed site auth fields" }, 401);
  }
  const { site_id, timestamp, nonce, hmac, ...rest } = body as Record<string, unknown>;
  if (
    typeof site_id !== "string" ||
    typeof timestamp !== "number" ||
    typeof nonce !== "string" ||
    typeof hmac !== "string"
  ) {
    return c.json({ error: "missing or malformed site auth fields" }, 401);
  }

  if (Math.abs(Date.now() - timestamp * 1000) > REPLAY_WINDOW_MS) {
    console.error("STALE TIMESTAMP"); return c.json({ error: "stale or future timestamp" }, 401);
  }

  const site = await getSiteById(db, site_id);
  if (!site) {
    return c.json({ error: "unknown site" }, 401);
  }

  const signedPayload = { site_id, timestamp, nonce, ...rest };
  try {
    const secret = decryptSiteSecret(site.siteSecretCiphertext, encryptionKey);
    if (!verifySignature(signedPayload, secret, hmac)) {
      console.error("INVALID SIGNATURE"); return c.json({ error: "invalid signature" }, 401);
    }
  } catch {
    // Malformed/undecryptable ciphertext is an auth failure from the
    // caller's perspective, not a server error — never a 500 here.
    console.error("INVALID SIGNATURE"); return c.json({ error: "invalid signature" }, 401);
  }

  if (!(await recordNonceIfUnused(db, site_id, nonce))) {
    console.error("REPLAYED REQUEST"); return c.json({ error: "replayed request" }, 401);
  }

  c.set("site", site);
  c.set("siteAuthPayload", signedPayload);
  await next();
};

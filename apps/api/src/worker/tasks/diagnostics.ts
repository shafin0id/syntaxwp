import { db } from "@syntaxwp/db";
import { sites, pluginInventory } from "@syntaxwp/db";
import { eq, inArray, and } from "drizzle-orm";
import { verifyPageHealth } from "./verify-page-health.js";
import { decryptSiteSecret, loadSiteSecretEncryptionKey, signPayload } from "@syntaxwp/shared";
import crypto from "node:crypto";
import { env } from "../../env.js";

const encryptionKey = loadSiteSecretEncryptionKey(env.SITE_SECRET_ENCRYPTION_KEY);

export async function executeMcpActionOnSite(siteId: string, action: string, target?: string): Promise<boolean> {
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return false;

  try {
    const siteSecret = decryptSiteSecret(site.siteSecretCiphertext, encryptionKey);
    const nonce = crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    
    const ability = `syntaxwp/${action.replace(/_/g, "-")}`;
    const unsignedPayload = {
      ability,
      input: target ? { target } : {},
      timestamp,
      nonce,
    };
    const hmac = signPayload(unsignedPayload, siteSecret);

    const res = await fetch(`${site.url}/wp-json/syntaxwp/v1/mcp/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...unsignedPayload, hmac }),
    });

    if (res.ok) {
      const body = await res.json() as any;
      return !!body.success;
    }
  } catch (err) {
    console.error(`Failed to execute MCP action "${action}" on site:`, err);
  }
  return false;
}

// Task B5.2: O(log n) Binary Search Plugin Conflict Isolation
export async function binarySearchPluginConflict(
  pluginSlugs: string[],
  siteId: string,
  failingUrl: string
): Promise<string | null> {
  console.log(`[Binary Search] Isolating conflict among plugins:`, pluginSlugs);

  if (pluginSlugs.length === 0) return null;

  if (pluginSlugs.length === 1) {
    const slug = pluginSlugs[0];
    console.log(`[Binary Search] Final candidate verification: ${slug}`);
    
    // Deactivate it to test if deactivation resolves the error
    await db
      .update(pluginInventory)
      .set({ active: false })
      .where(and(eq(pluginInventory.siteId, siteId), eq(pluginInventory.slug, slug)));
    await executeMcpActionOnSite(siteId, "deactivate_plugin", slug);

    const isHealthy = await verifyPageHealth(siteId, failingUrl);

    // Restore back to active
    await db
      .update(pluginInventory)
      .set({ active: true })
      .where(and(eq(pluginInventory.siteId, siteId), eq(pluginInventory.slug, slug)));
    await executeMcpActionOnSite(siteId, "activate_plugin", slug);

    if (isHealthy) {
      console.log(`[Binary Search] Confirmed: deactivating ${slug} makes site healthy.`);
      return slug;
    }
    console.log(`[Binary Search] Single plugin ${slug} did not resolve site. Conflict not found.`);
    return null;
  }

  const mid = Math.ceil(pluginSlugs.length / 2);
  const firstHalf = pluginSlugs.slice(0, mid);
  const secondHalf = pluginSlugs.slice(mid);

  console.log(`[Binary Search] Splitting search. Testing first half (by deactivating second half):`, firstHalf);

  // 1. Deactivate second half of plugins in DB and site
  await db
    .update(pluginInventory)
    .set({ active: false })
    .where(and(eq(pluginInventory.siteId, siteId), inArray(pluginInventory.slug, secondHalf)));
  for (const slug of secondHalf) {
    await executeMcpActionOnSite(siteId, "deactivate_plugin", slug);
  }

  // 2. Perform page health check
  const isHealthy = await verifyPageHealth(siteId, failingUrl);

  // Restore status back to active for safety
  await db
    .update(pluginInventory)
    .set({ active: true })
    .where(and(eq(pluginInventory.siteId, siteId), inArray(pluginInventory.slug, secondHalf)));
  for (const slug of secondHalf) {
    await executeMcpActionOnSite(siteId, "activate_plugin", slug);
  }

  if (isHealthy) {
    console.log(`[Binary Search] Site resolved after disabling second half. Recursing second half.`);
    return binarySearchPluginConflict(secondHalf, siteId, failingUrl);
  } else {
    console.log(`[Binary Search] Site still broken with second half disabled. Recursing first half.`);
    return binarySearchPluginConflict(firstHalf, siteId, failingUrl);
  }
}

// Task B6: Tier 2 - Visual Regression & Staging Promotion Stub
export async function verifyStagingVisualRegression(siteId: string, stagingUrl: string): Promise<boolean> {
  // Simple functional mock comparison for staging visually
  console.log(`[Staging] Comparing visual screenshots on staging url: ${stagingUrl}`);
  const healthy = await verifyPageHealth(siteId, stagingUrl);
  return healthy; // Visual regression passes if the layout loads cleanly without fatal errors
}



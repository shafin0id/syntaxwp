import { encryptSiteSecret, loadSiteSecretEncryptionKey } from "@syntaxwp/shared";
import { db, sql } from "./client.js";
import { orgs, sites, pluginInventory } from "./schema/index.js";

async function main() {
  const encryptionKey = loadSiteSecretEncryptionKey(process.env.SITE_SECRET_ENCRYPTION_KEY);

  console.log("Resetting database tables...");
  await sql`
    TRUNCATE TABLE 
      plugin_inventory, 
      incidents, 
      snapshots, 
      work_orders, 
      audit_log, 
      vulnerability_advisories, 
      performance_snapshots, 
      site_auth_nonces, 
      sites, 
      orgs 
    CASCADE
  `;

  console.log("Seeding real-time organization...");
  const [org] = await db
    .insert(orgs)
    .values({
      id: "37e0e110-c035-4d45-bc91-0d4a8dbf6116",
      name: "Greenleaf Botanicals",
      plan: "starter",
    })
    .returning();

  const siteId = "6d1ccf10-137b-4e87-86da-926853544f04";
  const siteSecret = "f49daba9b855c1edc3fc889f724b28013387d869044ba43d5c33130587d8e7ca";

  console.log("Seeding real-time site...");
  const [site] = await db
    .insert(sites)
    .values({
      id: siteId,
      orgId: org.id,
      url: "http://wp1.local",
      stagingUrl: "http://wp1.local",
      wpVersion: "7.0",
      executionPath: "wp7_native",
      permissionTier: "some_access",
      allowedActions: [
        "deactivate_plugin",
        "activate_plugin",
        "flush_cache",
        "clear_transients",
        "disable_maintenance_mode",
        "switch_theme"
      ],
      wooEnabled: true,
      siteSecretCiphertext: encryptSiteSecret(siteSecret, encryptionKey),
      avgOrderValue: 79,
      healthScore: 98,
    })
    .returning();

  console.log("Seeding plugin inventory for real-time site...");
  await db.insert(pluginInventory).values([
    {
      siteId: site.id,
      slug: "syntaxwp",
      version: "0.1.0",
      active: true,
      updateAvailable: false,
    },
    {
      siteId: site.id,
      slug: "anschat-for-wordpress",
      version: "1.6.0",
      active: true,
      updateAvailable: false,
    },
    {
      siteId: site.id,
      slug: "woocommerce",
      version: "10.8.1",
      active: true,
      updateAvailable: true,
    },
    {
      siteId: site.id,
      slug: "wp-rollback",
      version: "3.1.2",
      active: true,
      updateAvailable: false,
    },
    {
      siteId: site.id,
      slug: "angie",
      version: "1.1.8",
      active: false,
      updateAvailable: true,
    },
    {
      siteId: site.id,
      slug: "insert-headers-and-footers",
      version: "2.3.6",
      active: false,
      updateAvailable: true,
    }
  ]);

  console.log("Real-time seed complete.");
  console.log("Site ID:", site.id);
  console.log("Site Secret:", siteSecret);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

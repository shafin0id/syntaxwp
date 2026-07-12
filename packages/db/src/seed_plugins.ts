import { db } from "./client.js";
import { pluginInventory, sites } from "./schema/index.js";
import { eq, sql } from "drizzle-orm";

async function main() {
  const [site] = await db.select().from(sites).limit(1);
  if (!site) {
    console.error("No site found.");
    return;
  }

  // Clear previous plugin inventory for clean testing
  await db.execute(sql`TRUNCATE TABLE plugin_inventory CASCADE`);

  console.log("Seeding actual active plugins for local site...");
  await db.insert(pluginInventory).values([
    {
      siteId: site.id,
      slug: "anschat-for-wordpress",
      version: "1.0.0",
      active: true,
      updateAvailable: false,
    },
    {
      siteId: site.id,
      slug: "syntaxwp-probe",
      version: "1.0.0",
      active: true,
      updateAvailable: false,
    },
    {
      siteId: site.id,
      slug: "wp-rollback",
      version: "1.5.0",
      active: true,
      updateAvailable: true,
    }
  ]);

  // Update permissionTier to some_access, set allowedActions, and stagingUrl to match wp1.local
  await db.update(sites).set({
    permissionTier: "some_access",
    allowedActions: ["deactivate_plugin", "activate_plugin", "flush_cache", "clear_transients", "disable_maintenance_mode", "switch_theme"],
    stagingUrl: "http://wp1.local",
  }).where(eq(sites.id, site.id));
  console.log("Seeded and updated settings successfully.");
}

main().catch(console.error);

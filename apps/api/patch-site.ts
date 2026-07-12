import { db } from "@syntaxwp/db";
import { sites, workOrders, snapshots, auditLog, incidents, pluginInventory, performanceSnapshots, vulnerabilityAdvisories } from "@syntaxwp/db";
import { eq } from "drizzle-orm";

async function run() {
  const dummyId = '6f8ca533-156b-4e2f-88ab-ba81447c2221';
  
  // Delete all related records first
  await db.delete(workOrders).where(eq(workOrders.siteId, dummyId));
  await db.delete(snapshots).where(eq(snapshots.siteId, dummyId));
  await db.delete(auditLog).where(eq(auditLog.siteId, dummyId));
  await db.delete(incidents).where(eq(incidents.siteId, dummyId));
  await db.delete(pluginInventory).where(eq(pluginInventory.siteId, dummyId));
  await db.delete(performanceSnapshots).where(eq(performanceSnapshots.siteId, dummyId));
  
  // Now delete the site
  await db.delete(sites).where(eq(sites.id, dummyId));
  
  console.log("Deleted dummy site fully!");
  process.exit(0);
}
run();

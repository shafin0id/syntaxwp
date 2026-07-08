import { and, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { pluginInventory } from "../schema/index.js";

export type PluginInventoryEntry = typeof pluginInventory.$inferSelect;

export interface HeartbeatPlugin {
  slug: string;
  version?: string;
  active?: boolean;
}

// Upserts on (site_id, slug) — a heartbeat every 60s (§4.3) reports the
// full current plugin list each time, so this always reflects "as of the
// last heartbeat," not a growing history (that's what audit_log is for).
export async function upsertPluginInventory(
  db: Database,
  siteId: string,
  plugins: HeartbeatPlugin[],
): Promise<void> {
  for (const plugin of plugins) {
    await db
      .insert(pluginInventory)
      .values({
        siteId,
        slug: plugin.slug,
        version: plugin.version,
        active: plugin.active,
        recordedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [pluginInventory.siteId, pluginInventory.slug],
        set: { version: plugin.version, active: plugin.active, recordedAt: new Date() },
      });
  }
}

export async function listPluginInventoryForSite(
  db: Database,
  siteId: string,
): Promise<PluginInventoryEntry[]> {
  return db.select().from(pluginInventory).where(eq(pluginInventory.siteId, siteId));
}

// Exported for Track B's future vulnerability-matching use (B9) — unused
// today, kept here since it's a one-line, obviously-correct piece of this
// repository's surface rather than something to bolt on ad hoc later.
export async function getPluginInventoryEntry(
  db: Database,
  siteId: string,
  slug: string,
): Promise<PluginInventoryEntry | undefined> {
  const [row] = await db
    .select()
    .from(pluginInventory)
    .where(and(eq(pluginInventory.siteId, siteId), eq(pluginInventory.slug, slug)));
  return row;
}

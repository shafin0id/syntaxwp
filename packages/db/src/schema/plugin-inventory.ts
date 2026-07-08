import { pgTable, uuid, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { sites } from "./sites.js";

// §14.1 — Plugin/Theme Inventory. Unique on (site_id, slug) — added in A5a.2b
// so the heartbeat endpoint can upsert "current installed version/active
// state" per plugin instead of inserting an ever-growing row per heartbeat
// for the same plugin (heartbeats arrive every 60s per §4.3).
export const pluginInventory = pgTable(
  "plugin_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id),
    slug: text("slug").notNull(),
    version: text("version"),
    active: boolean("active"),
    updateAvailable: boolean("update_available").default(false),
    updateVersion: text("update_version"),
    riskScore: text("risk_score").default("unknown"), // from vulnerability matching
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [unique("plugin_inventory_site_id_slug_unique").on(table.siteId, table.slug)],
);

import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { sites } from "./sites.js";

// §14.1 — Plugin/Theme Inventory
export const pluginInventory = pgTable("plugin_inventory", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  slug: text("slug").notNull(),
  version: text("version"),
  active: boolean("active"),
  updateAvailable: boolean("update_available").default(false),
  updateVersion: text("update_version"),
  riskScore: text("risk_score").default("unknown"), // from vulnerability matching
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow(),
});

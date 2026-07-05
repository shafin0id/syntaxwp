import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { sites } from "./sites.js";
import { workOrders } from "./work-orders.js";

// §14.1 — Snapshots (pre-action, for revert). 30-day retention then deleted (§14.2).
export const snapshots = pgTable("snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  workOrderId: uuid("work_order_id").references(() => workOrders.id),
  activePlugins: jsonb("active_plugins"), // array of {slug, version, active}
  optionsChecksum: text("options_checksum"),
  fileChecksums: jsonb("file_checksums"), // {filepath: checksum}, modified files only
  storageKey: text("storage_key"), // R2/MinIO key for any file content stored
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

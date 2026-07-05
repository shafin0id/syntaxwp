import { pgTable, uuid, integer, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { sites } from "./sites.js";

// §14.1 — Performance snapshots (Core Web Vitals, §13.1)
export const performanceSnapshots = pgTable("performance_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  lcpMs: integer("lcp_ms"),
  inpMs: integer("inp_ms"),
  clsFloat: doublePrecision("cls_float"),
  fcpMs: integer("fcp_ms"),
  ttfbMs: integer("ttfb_ms"),
  collectedAt: timestamp("collected_at", { withTimezone: true }).defaultNow(),
});

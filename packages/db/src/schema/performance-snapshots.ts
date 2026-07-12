import { pgTable, uuid, integer, doublePrecision, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { sites } from "./sites.js";

export const formFactorEnum = pgEnum("form_factor", ["desktop", "mobile", "synthetic"]);

// §14.1 — Performance snapshots (Core Web Vitals, §13.1)
export const performanceSnapshots = pgTable("performance_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  lcpMs: integer("lcp_ms"),
  inpMs: integer("inp_ms"),
  clsFloat: doublePrecision("cls_float"),
  fcpMs: integer("fcp_ms"),
  ttfbMs: integer("ttfb_ms"),
  formFactor: formFactorEnum("form_factor").notNull().default("desktop"),
  collectedAt: timestamp("collected_at", { withTimezone: true }).defaultNow(),
});

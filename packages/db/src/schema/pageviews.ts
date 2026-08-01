import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { sites } from "./sites.js";

// §13.3 — lightweight, GDPR-clean pageview tracking: no IP, no user ID,
// no fingerprint, just path + referrer.
export const pageviews = pgTable("pageviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  path: text("path").notNull(),
  referrer: text("referrer"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

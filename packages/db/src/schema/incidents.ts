import { pgTable, uuid, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { sites } from "./sites.js";

// §14.1 — Incidents
export const incidents = pgTable("incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  fingerprint: text("fingerprint").notNull().unique(), // for deduplication, §5.3
  type: text("type").notNull(), // php_fatal|wsod|checkout_failure|perf_regression|plugin_conflict
  severity: text("severity").notNull(), // high|medium|low
  status: text("status").notNull().default("open"), // open|diagnosing|fixing|resolved|escalated
  class: text("class"), // server|client|performance|security
  methodUsed: text("method_used"), // health_check|staging|clone|production
  rootCause: text("root_cause"),
  plainEnglish: text("plain_english"),
  confidence: doublePrecision("confidence"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

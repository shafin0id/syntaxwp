import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";

// §14.1 — Immutable Audit Log. No UPDATE or DELETE ever issued to this table
// (application-level constraint + Postgres RLS policy, enforced in Task A2/A8).
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull(),
  incidentId: uuid("incident_id"),
  workOrderId: uuid("work_order_id"),
  eventType: text("event_type").notNull(),
  actor: text("actor").notNull(), // 'system' | 'user:{user_id}'
  summary: text("summary").notNull(), // plain English
  evidence: jsonb("evidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

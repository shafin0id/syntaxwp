import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const securityActionsLog = pgTable("security_actions_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull(),
  actionType: text("action_type").notNull(), // 'FILE_AUTO_REPAIR' | 'CRITICAL_VULNERABILITY_ISOLATION'
  target: text("target").notNull(),
  status: text("status").notNull(), // 'SUCCESS' | 'FAILED'
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

// §14.1 — Tenants
export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("starter"), // starter|pro|agency
  permissionDefault: text("permission_default").notNull().default("some_access"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

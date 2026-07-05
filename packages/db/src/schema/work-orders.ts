import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { sites } from "./sites.js";
import { incidents } from "./incidents.js";

// §14.1 / §8.2 — Work Orders. Immutable after signing (§14.2) — application
// code must only ever UPDATE `status`/`claimed_at`/`executed_at`/`result`,
// never the signed fields (action/target/parameters/hmac/issued_at/expires_at).
export const workOrders = pgTable("work_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  incidentId: uuid("incident_id").references(() => incidents.id),
  action: text("action").notNull(),
  target: text("target"),
  parameters: jsonb("parameters"),
  status: text("status").notNull().default("pending"), // pending|claimed|executed|reverted|expired
  risk: text("risk").notNull(),
  hmac: text("hmac").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  result: jsonb("result"),
});

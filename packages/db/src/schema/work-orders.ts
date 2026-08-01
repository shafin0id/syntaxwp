import { pgTable, uuid, text, jsonb, integer, timestamp } from "drizzle-orm/pg-core";
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
  // awaiting_approval|pending|claimed|executed|reverted|expired|declined —
  // see WORK_ORDER_STATUSES (packages/shared/src/work-order.ts) for what
  // each means and the A3.4 comment there on awaiting_approval/declined.
  status: text("status").notNull().default("pending"),
  risk: text("risk").notNull(),
  hmac: text("hmac").notNull(),
  // How long the plugin's dead man's switch waits before auto-reverting if
  // no "still healthy" confirmation arrives after executing this action
  // (§9.2, A4.1) — part of the signed wire payload (WorkOrderSchema), so it
  // must be persisted alongside the other signed fields, not derived later.
  deadMansSwitchMs: integer("dead_mans_switch_ms").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  result: jsonb("result"),
});

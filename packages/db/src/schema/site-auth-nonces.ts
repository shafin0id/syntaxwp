import { pgTable, uuid, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { sites } from "./sites.js";

// Replay-protection ledger for site-HMAC-authenticated requests (A5a.1,
// heartbeat/events; the same mechanism work orders use in A3.1, but a work
// order's own `id` doubles as its nonce there — this table is only for
// request payloads that don't already have a unique identifier to reuse).
// A Graphile Worker job (A5a's follow-up, see worker/tasks) prunes rows
// older than the 5-minute replay window on a schedule; there's no unbounded
// growth concern in the meantime since every row is small and short-lived.
export const siteAuthNonces = pgTable(
  "site_auth_nonces",
  {
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id),
    nonce: text("nonce").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.nonce] })],
);

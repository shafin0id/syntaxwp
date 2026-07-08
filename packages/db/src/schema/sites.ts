import { pgTable, uuid, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { orgs } from "./orgs.js";

// §14.1 — Sites
export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  url: text("url").notNull(),
  stagingUrl: text("staging_url"), // client's own staging
  wpVersion: text("wp_version"),
  executionPath: text("execution_path"), // 'wp7_native' | 'legacy_outbound'
  permissionTier: text("permission_tier").notNull().default("some_access"),
  wooEnabled: boolean("woo_enabled").default(false),
  // AES-256-GCM envelope (see packages/shared/src/site-secret.ts), not
  // plaintext — decrypted on demand to verify plugin HMAC signatures (A2.4).
  siteSecretCiphertext: text("site_secret_ciphertext").notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  healthScore: integer("health_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

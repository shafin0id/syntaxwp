import { desc, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { auditLog } from "../schema/index.js";

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

// Deliberately no update/delete export from this module — audit_log is
// append-only (§14.2, enforced at the DB level by the trigger in migration
// 0001_audit_log_append_only.sql). Keeping the mutation surface absent here
// means a future caller can't accidentally reach for an update helper that
// would just fail at the DB anyway; the only way to correct a bad entry is
// to insert a new one that supersedes it.
export async function insertAuditLog(
  db: Database,
  entry: NewAuditLogEntry,
): Promise<AuditLogEntry> {
  const [row] = await db.insert(auditLog).values(entry).returning();
  return row;
}

export async function listAuditLogForSite(
  db: Database,
  siteId: string,
): Promise<AuditLogEntry[]> {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.siteId, siteId))
    .orderBy(desc(auditLog.createdAt));
}

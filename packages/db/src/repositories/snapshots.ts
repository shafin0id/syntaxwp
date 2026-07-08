import { desc, eq, lt } from "drizzle-orm";
import type { Database } from "../client.js";
import { snapshots } from "../schema/index.js";

export type SnapshotRow = typeof snapshots.$inferSelect;

export interface CreateSnapshotInput {
  siteId: string;
  workOrderId?: string;
  activePlugins?: unknown;
  optionsChecksum?: string;
  fileChecksums?: unknown;
  storageKey?: string;
}

// §14.1's pre-action micro-snapshot (A4.2). Content that belongs in R2/MinIO
// (raw file bytes) is uploaded by the caller first; only the resulting
// storageKey and lightweight metadata land here.
export async function createSnapshot(db: Database, input: CreateSnapshotInput): Promise<SnapshotRow> {
  const [row] = await db.insert(snapshots).values(input).returning();
  return row;
}

// A work order is only ever snapshotted once, immediately before it
// executes — most-recent-first ordering is defensive, not load-bearing.
export async function getSnapshotForWorkOrder(
  db: Database,
  workOrderId: string,
): Promise<SnapshotRow | undefined> {
  const [row] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.workOrderId, workOrderId))
    .orderBy(desc(snapshots.createdAt))
    .limit(1);
  return row;
}

export async function getSnapshotById(db: Database, id: string): Promise<SnapshotRow | undefined> {
  const [row] = await db.select().from(snapshots).where(eq(snapshots.id, id));
  return row;
}

// §14.2's 30-day retention window (A4.4). Returns the deleted rows, not
// just a count — the caller needs each row's storageKey to also delete the
// corresponding object from R2/MinIO, and deleting the DB row first would
// lose that key and orphan the blob forever.
export async function deleteSnapshotsOlderThan(db: Database, cutoff: Date): Promise<SnapshotRow[]> {
  return db.delete(snapshots).where(lt(snapshots.createdAt, cutoff)).returning();
}

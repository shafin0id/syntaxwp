import type { Task } from "graphile-worker";
import { db, deleteSnapshotsOlderThan } from "@syntaxwp/db";
import { createS3StorageClient, type ObjectStorageClient } from "@syntaxwp/shared";
import { env } from "../../env.js";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // §14.2

// Lazily created, process-lifetime singleton — same rationale as the site
// secret encryption key and the dead-man's-switch WorkerUtils instance:
// build the client once, not per task run.
let storageClient: ObjectStorageClient | undefined;
function getStorageClient(): ObjectStorageClient {
  if (!storageClient) {
    storageClient = createS3StorageClient({
      bucket: env.R2_BUCKET_NAME,
      endpoint: env.R2_ENDPOINT,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    });
  }
  return storageClient;
}

// A4.4 — §14.2: "Snapshots: content in R2, metadata in Postgres. 30-day
// retention, then deleted." Runs once daily (see apps/api/crontab); unlike
// the nonce/work-order sweeps (5-min/1-min windows), a 30-day retention
// window doesn't need frequent checking.
//
// Deletes the Postgres row via deleteSnapshotsOlderThan first (it returns
// the full rows, storageKey included), then deletes each row's R2/MinIO
// object by key. Doing it in this order — not object-then-row — means a
// crash between the two steps leaves an orphaned blob (cheap: it'll be
// deleted on this task's next run once directory-listing-based cleanup
// exists, or manually) rather than a DB row pointing at nothing, which
// would be a dangling reference every future query has to guard against.
export const snapshotRetentionSweep: Task = async () => {
  const cutoff = new Date(Date.now() - RETENTION_MS);
  const deleted = await deleteSnapshotsOlderThan(db, cutoff);
  if (deleted.length === 0) {
    return;
  }

  const storage = getStorageClient();
  for (const snapshot of deleted) {
    if (snapshot.storageKey) {
      await storage.deleteObject(snapshot.storageKey);
    }
  }
  console.log(`[snapshot_retention_sweep] deleted ${deleted.length} snapshot(s) older than 30 days`);
};

import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterAll, describe, expect, it } from "vitest";
import {
  db,
  sql,
  createOrg,
  createSite,
  createSnapshot,
  getSnapshotById,
  issueWorkOrder,
} from "@syntaxwp/db";
import { createS3StorageClient } from "@syntaxwp/shared";
import { env } from "../../env.js";
import { snapshotRetentionSweep } from "./snapshot-retention.js";

afterAll(async () => {
  await sql.end();
});

const rawS3Client = new S3Client({
  endpoint: env.R2_ENDPOINT,
  region: "auto",
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

async function objectExists(key: string): Promise<boolean> {
  try {
    await rawS3Client.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function makeTestSiteAndWorkOrder() {
  const org = await createOrg(db, { name: "retention-test-org" });
  const site = await createSite(db, {
    orgId: org.id,
    url: "http://retention-test.example",
    siteSecretCiphertext: "irrelevant",
  });
  const { row: workOrder } = await issueWorkOrder(db, {
    siteId: site.id,
    action: "flush_cache",
    risk: "low",
    deadMansSwitchMs: 30_000,
    siteSecret: "secret",
  });
  return { site, workOrder };
}

// Integration test — needs both a live local Postgres (same caveat as every
// other A2/A3/A4 suite) and a live local MinIO (`docker compose up -d
// minio`, see LOCAL-DEVELOPMENT-SETUP.md §5) with the dev bucket already
// created — Task A8.2 is what wires either into CI.
describe("snapshotRetentionSweep task", () => {
  it("deletes a snapshot's DB row and its R2/MinIO blob once past the 30-day retention window", async () => {
    const { site, workOrder } = await makeTestSiteAndWorkOrder();
    const storage = createS3StorageClient({
      bucket: env.R2_BUCKET_NAME,
      endpoint: env.R2_ENDPOINT,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    });
    const storageKey = `snapshots/${workOrder.id}/retention-test.bin`;
    await storage.putObject(storageKey, Buffer.from("snapshot content"));
    expect(await objectExists(storageKey)).toBe(true);

    const snapshot = await createSnapshot(db, {
      siteId: site.id,
      workOrderId: workOrder.id,
      storageKey,
    });
    await sql`update snapshots set created_at = now() - interval '31 days' where id = ${snapshot.id}`;

    await snapshotRetentionSweep(undefined, undefined as never);

    expect(await getSnapshotById(db, snapshot.id)).toBeUndefined();
    expect(await objectExists(storageKey)).toBe(false);
  });

  it("does not touch a snapshot inside the 30-day window", async () => {
    const { site, workOrder } = await makeTestSiteAndWorkOrder();
    const snapshot = await createSnapshot(db, { siteId: site.id, workOrderId: workOrder.id });

    await snapshotRetentionSweep(undefined, undefined as never);

    expect((await getSnapshotById(db, snapshot.id))?.id).toBe(snapshot.id);
  });

  it("deletes an old snapshot with no storageKey without attempting a storage call", async () => {
    const { site, workOrder } = await makeTestSiteAndWorkOrder();
    const snapshot = await createSnapshot(db, { siteId: site.id, workOrderId: workOrder.id });
    await sql`update snapshots set created_at = now() - interval '31 days' where id = ${snapshot.id}`;

    await expect(snapshotRetentionSweep(undefined, undefined as never)).resolves.not.toThrow();
    expect(await getSnapshotById(db, snapshot.id)).toBeUndefined();
  });
});

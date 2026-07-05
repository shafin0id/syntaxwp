import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectStorageClient } from "./storage.js";

export interface S3StorageConfig {
  bucket: string;
  endpoint: string; // R2 endpoint in prod, http://localhost:9000 (MinIO) locally
  accessKeyId: string;
  secretAccessKey: string;
  region?: string; // R2/MinIO ignore this, but the SDK requires a value
}

// One implementation satisfies both real R2 and local MinIO (Task 1.10) —
// both speak the S3 API, so only the config passed in differs.
export function createS3StorageClient(config: S3StorageConfig): ObjectStorageClient {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region ?? "auto",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true, // required for MinIO; harmless for R2
  });

  return {
    async putObject(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async getSignedUrl(key, expiresInSeconds = 3600) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
        expiresIn: expiresInSeconds,
      });
    },
  };
}

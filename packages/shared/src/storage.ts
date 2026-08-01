// S3-compatible storage contract. Real Cloudflare R2 and local MinIO (Task
// 1.10) both satisfy this interface, so callers never branch on environment.
export interface ObjectStorageClient {
  putObject(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  // Added for A4.4's 30-day snapshot retention job (§14.2: "content in R2,
  // metadata in Postgres... then deleted") — the first caller that actually
  // needs to remove a previously-uploaded object rather than just read or
  // write one.
  deleteObject(key: string): Promise<void>;
}

// S3-compatible storage contract. Real Cloudflare R2 and local MinIO (Task
// 1.10) both satisfy this interface, so callers never branch on environment.
export interface ObjectStorageClient {
  putObject(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

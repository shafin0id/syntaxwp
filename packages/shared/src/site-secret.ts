import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// Site secrets (§15.3) are HMAC *keys*, not passwords — the API must be able
// to recover the plaintext to verify a plugin's signed requests, so they
// can't be one-way hashed like a password would be. AES-256-GCM here is the
// app-level substitute for Supabase Vault/pgsodium: this schema is managed
// entirely through Drizzle direct-to-Postgres (§0.1), not Supabase's own
// tooling, so transparent column encryption isn't naturally available.
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32; // AES-256
const IV_LENGTH_BYTES = 12; // 96-bit nonce, the GCM-recommended size
const AUTH_TAG_LENGTH_BYTES = 16;

// "v1:" prefix versions the envelope format so a future algorithm or field
// layout change doesn't require a schema migration — decrypt() can dispatch
// on the prefix once a "v2:" exists.
const ENVELOPE_PREFIX = "v1:";

export function generateSiteSecret(): string {
  return randomBytes(32).toString("hex");
}

// Reads SITE_SECRET_ENCRYPTION_KEY independently of any Zod env schema so
// that callers outside apps/api (packages/db/src/seed.ts reads
// process.env directly and has no schema of its own) still fail fast with a
// clear error instead of silently encrypting with a garbage-length key.
export function loadSiteSecretEncryptionKey(rawEnvValue: string | undefined): Buffer {
  if (!rawEnvValue) {
    throw new Error(
      "SITE_SECRET_ENCRYPTION_KEY is not set — generate one with " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"` " +
        "and see LOCAL-DEVELOPMENT-SETUP.md §3.",
    );
  }
  const key = Buffer.from(rawEnvValue, "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `SITE_SECRET_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH_BYTES} bytes ` +
        `(got ${key.length}) — it must be a base64-encoded 32-byte AES-256 key.`,
    );
  }
  return key;
}

export function encryptSiteSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENVELOPE_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSiteSecret(envelope: string, key: Buffer): string {
  if (!envelope.startsWith(ENVELOPE_PREFIX)) {
    throw new Error(`Unrecognized site secret envelope format: ${envelope.slice(0, 8)}...`);
  }
  const raw = Buffer.from(envelope.slice(ENVELOPE_PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LENGTH_BYTES);
  const authTag = raw.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const ciphertext = raw.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

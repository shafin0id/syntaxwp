import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptSiteSecret,
  encryptSiteSecret,
  generateSiteSecret,
  loadSiteSecretEncryptionKey,
} from "./site-secret.js";

describe("site-secret encryption", () => {
  it("round-trips plaintext through encrypt/decrypt", () => {
    const key = randomBytes(32);
    const plaintext = generateSiteSecret();
    const envelope = encryptSiteSecret(plaintext, key);
    expect(envelope.startsWith("v1:")).toBe(true);
    expect(decryptSiteSecret(envelope, key)).toBe(plaintext);
  });

  it("produces a different envelope each time (random IV) for the same plaintext", () => {
    const key = randomBytes(32);
    const plaintext = generateSiteSecret();
    expect(encryptSiteSecret(plaintext, key)).not.toBe(encryptSiteSecret(plaintext, key));
  });

  it("fails to decrypt with the wrong key", () => {
    const envelope = encryptSiteSecret(generateSiteSecret(), randomBytes(32));
    expect(() => decryptSiteSecret(envelope, randomBytes(32))).toThrow();
  });

  it("loadSiteSecretEncryptionKey rejects a missing value", () => {
    expect(() => loadSiteSecretEncryptionKey(undefined)).toThrow(/not set/i);
  });

  it("loadSiteSecretEncryptionKey rejects a wrong-length key", () => {
    expect(() => loadSiteSecretEncryptionKey(randomBytes(16).toString("base64"))).toThrow(
      /32 bytes/i,
    );
  });

  it("loadSiteSecretEncryptionKey accepts a valid 32-byte base64 key", () => {
    const key = loadSiteSecretEncryptionKey(randomBytes(32).toString("base64"));
    expect(key.length).toBe(32);
  });
});

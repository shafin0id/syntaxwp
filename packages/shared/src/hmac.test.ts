import { describe, expect, it } from "vitest";
import { canonicalizeForSigning, signPayload, verifySignature } from "./hmac.js";

describe("canonicalizeForSigning", () => {
  it("produces identical output regardless of input key order", () => {
    const a = canonicalizeForSigning({ b: 1, a: 2, c: { z: 1, y: 2 } });
    const b = canonicalizeForSigning({ a: 2, c: { y: 2, z: 1 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":{"y":2,"z":1}}');
  });

  it("preserves array order (only object keys are sorted)", () => {
    expect(canonicalizeForSigning({ list: [3, 1, 2] })).toBe('{"list":[3,1,2]}');
  });

  it("sorts keys at every nesting level, not just the top", () => {
    const nested = canonicalizeForSigning({ outer: { z: { b: 1, a: 2 }, a: 1 } });
    expect(nested).toBe('{"outer":{"a":1,"z":{"a":2,"b":1}}}');
  });
});

describe("signPayload / verifySignature", () => {
  const secret = "test-secret-key";

  it("verifies a correctly-signed payload", () => {
    const payload = { site_id: "abc", timestamp: 1700000000, nonce: "n1" };
    const sig = signPayload(payload, secret);
    expect(verifySignature(payload, secret, sig)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const payload = { site_id: "abc", timestamp: 1700000000, nonce: "n1" };
    const sig = signPayload(payload, secret);
    expect(verifySignature({ ...payload, site_id: "tampered" }, secret, sig)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const payload = { site_id: "abc", timestamp: 1700000000, nonce: "n1" };
    const sig = signPayload(payload, secret);
    expect(verifySignature(payload, "wrong-secret", sig)).toBe(false);
  });

  it("rejects a malformed/wrong-length signature without throwing", () => {
    const payload = { site_id: "abc", timestamp: 1700000000, nonce: "n1" };
    expect(verifySignature(payload, secret, "not-a-real-signature")).toBe(false);
  });

  it("is order-independent (same payload, keys given in different order)", () => {
    const sig = signPayload({ a: 1, b: 2 }, secret);
    expect(verifySignature({ b: 2, a: 1 }, secret, sig)).toBe(true);
  });
});

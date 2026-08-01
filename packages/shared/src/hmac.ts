import { createHmac, timingSafeEqual } from "node:crypto";

// Shared HMAC canonicalization for every signed payload in this system:
// site-to-API auth (heartbeat/events, A5a.1) and work orders (A3.1). One
// signing code path for both, so there's exactly one place to get this
// right instead of two implementations drifting apart over time.
//
// This same spec must also be implemented in PHP for the WordPress plugin
// (packages/plugin/safety/WorkOrderValidator.php, Task A6.2) — the plugin
// can't import this module, so it's a manually-ported, carefully-tested
// cross-language contract, not shared code. Golden fixture vectors (see
// packages/shared/test/fixtures/) pin both implementations to the same
// expected output so a drift between them fails a test immediately instead
// of producing silently-mismatched signatures at runtime.
//
// Canonicalization: recursively sort object keys lexicographically (byte
// order — PHP's `ksort($arr, SORT_STRING)` equivalent) at every nesting
// level, preserving array/list order as-is, then JSON-encode. This is
// deliberately more explicit than relying on either language's natural
// object/associative-array insertion order, which isn't guaranteed to
// match across two different runtimes decoding/building the same logical
// payload independently.
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      sorted[key] = sortKeysDeep(input[key]);
    }
    return sorted;
  }
  return value;
}

// Caller is responsible for omitting the signature field itself (e.g. `hmac`)
// from `payload` before calling — this function signs exactly what it's given.
export function canonicalizeForSigning(payload: Record<string, unknown>): string {
  return JSON.stringify(sortKeysDeep(payload));
}

export function signPayload(payload: Record<string, unknown>, secret: string): string {
  return createHmac("sha256", secret).update(canonicalizeForSigning(payload)).digest("hex");
}

// Constant-time comparison — a naive `===` here would leak signature bytes
// through response-timing differences to an attacker probing the endpoint.
export function verifySignature(
  payload: Record<string, unknown>,
  secret: string,
  signature: string,
): boolean {
  const expected = signPayload(payload, secret);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) {
    return false; // timingSafeEqual throws on length mismatch rather than returning false
  }
  return timingSafeEqual(expectedBuf, actualBuf);
}

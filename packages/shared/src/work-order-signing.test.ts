import { describe, expect, it } from "vitest";
import { canonicalizeForSigning, signPayload } from "./hmac.js";
import { signWorkOrder, verifyWorkOrderSignature } from "./work-order-signing.js";
import type { WorkOrder } from "./work-order.js";
import vectors from "../test/fixtures/work-order-hmac-vectors.json" with { type: "json" };

// These vectors are the single source of truth PHP's WorkOrderValidator.php
// (Task A6.2) must also reproduce exactly — see test/fixtures/README.md.
// This test proves packages/shared's own implementation matches its own
// documented golden values (regression protection); it can't prove PHP
// matches without PHP existing yet, but the vectors are what will do that
// once A6.2 lands.
describe("work order HMAC golden vectors", () => {
  for (const vector of vectors) {
    it(vector.description, () => {
      expect(canonicalizeForSigning(vector.payload)).toBe(vector.expectedCanonicalJson);
      expect(signPayload(vector.payload, vector.secret)).toBe(vector.expectedHmac);
    });
  }
});

describe("signWorkOrder / verifyWorkOrderSignature", () => {
  const secret = "test-secret";
  const basePayload: Omit<WorkOrder, "hmac"> = {
    id: "11111111-1111-4111-8111-111111111111",
    site_id: "22222222-2222-4222-8222-222222222222",
    action: "flush_cache",
    target: "",
    parameters: {},
    issued_at: 1751234567,
    expires_at: 1751234867,
    dead_mans_switch_ms: 30000,
  };

  it("produces a signature verifyWorkOrderSignature accepts", () => {
    const hmac = signWorkOrder(basePayload, secret);
    const workOrder: WorkOrder = { ...basePayload, hmac };
    expect(verifyWorkOrderSignature(workOrder, secret)).toBe(true);
  });

  it("rejects a tampered field", () => {
    const hmac = signWorkOrder(basePayload, secret);
    const tampered: WorkOrder = { ...basePayload, hmac, target: "tampered" };
    expect(verifyWorkOrderSignature(tampered, secret)).toBe(false);
  });

  it("rejects an unwhitelisted action at the schema level", () => {
    expect(() =>
      signWorkOrder({ ...basePayload, action: "not_a_real_action" as never }, secret),
    ).toThrow();
  });
});

import { signPayload, verifySignature } from "./hmac.js";
import { WorkOrderSchema, type WorkOrder } from "./work-order.js";

// Wire-shape-aware wrappers around the generic HMAC primitives in hmac.ts —
// validates against WorkOrderSchema (§8.2) before signing / before trusting
// a signature check, so a caller can't silently sign or accept a malformed
// payload. The canonicalization itself (recursive key-sort) lives in
// hmac.ts, shared with A5a.1's site-auth signing — this module is just the
// work-order-specific contract on top of it.
//
// Replay protection: a work order's own `id` (a UUID, unique per row) is
// reused as its nonce rather than adding a separate field — it already has
// the properties a nonce needs, and the plugin's dedup transient (Task
// A6.2) is keyed by it the same way A5a.1's nonce ledger is keyed by an
// explicit `nonce` field for heartbeat/events requests.

export function signWorkOrder(payload: Omit<WorkOrder, "hmac">, secret: string): string {
  const validated = WorkOrderSchema.omit({ hmac: true }).parse(payload);
  return signPayload(validated, secret);
}

export function verifyWorkOrderSignature(workOrder: WorkOrder, secret: string): boolean {
  const { hmac, ...rest } = WorkOrderSchema.parse(workOrder);
  return verifySignature(rest, secret, hmac);
}

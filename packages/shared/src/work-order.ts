import { z } from "zod";
import { WorkOrderActionSchema } from "./actions.js";

// §8.2 — the signed payload the plugin claims and executes. Immutable once
// signed; only `status` moves after issuance (Task A3 owns issuance/expiry).
export const WorkOrderSchema = z.object({
  id: z.string().uuid(),
  site_id: z.string().uuid(),
  action: WorkOrderActionSchema,
  target: z.string(),
  parameters: z.record(z.unknown()),
  issued_at: z.number().int(),
  expires_at: z.number().int(),
  dead_mans_switch_ms: z.number().int().nonnegative(),
  hmac: z.string(),
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;

// "awaiting_approval" and "declined" added in A3.4 — a policyDecision of
// "ask" (§9.3) issues the work order (it's signed and exists) but it isn't
// claimable by the plugin until a dashboard user approves it, moving it to
// "pending" the same as an "allow"-decision order. "declined" is terminal:
// the signed order still exists (for audit purposes) but is never claimable.
export const WORK_ORDER_STATUSES = [
  "awaiting_approval",
  "pending",
  "claimed",
  "executed",
  "reverted",
  "expired",
  "declined",
] as const;
export const WorkOrderStatusSchema = z.enum(WORK_ORDER_STATUSES);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatusSchema>;

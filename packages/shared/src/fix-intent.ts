import { z } from "zod";
import { WorkOrderActionSchema } from "./actions.js";

// §7.4 — output contract for the Fix Generation LLM call. The LLM never
// executes anything; it only ever produces a value matching this schema,
// which the policy engine (Task A3) then evaluates deterministically.
export const FixIntentSchema = z.object({
  action: WorkOrderActionSchema,
  target: z.string(),
  parameters: z.record(z.unknown()).optional(),
  reason: z.string(),
  evidence_ids: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reversibility: z.enum(["instant", "snapshot_required", "manual_only"]),
  risk: z.enum(["low", "medium", "high"]),
});
export type FixIntent = z.infer<typeof FixIntentSchema>;

// §7.4 — output contract for the Evidence Correlation LLM call.
export const IncidentDiagnosisSchema = z.object({
  root_cause: z.string(),
  evidence: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  suspect_plugins: z.array(z.string()),
  plain_english: z.string(),
  escalate: z.boolean(),
});
export type IncidentDiagnosis = z.infer<typeof IncidentDiagnosisSchema>;

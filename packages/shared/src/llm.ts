import type { ZodSchema } from "zod";

// §7.1/§7.2 — task-to-model routing contract. `schema` is whatever the
// caller expects back (e.g. FixIntentSchema, IncidentDiagnosisSchema) and is
// used by the LLM router (Task B4) to validate raw model output before
// returning it to the caller.
export type LLMTask = "classify" | "correlate" | "fix" | "safety" | "vision" | "async";
export type Severity = "high" | "medium" | "low";

export interface LLMRequest<TSchema extends ZodSchema = ZodSchema> {
  task: LLMTask;
  severity?: Severity;
  input: Record<string, unknown>;
  schema: TSchema;
}

import { ACTION_RISK_MAP, type PermissionTier, type WorkOrderAction } from "./actions.js";

export type PolicyDecision = "allow" | "ask" | "block";

// §9.3, ported verbatim from the architecture doc's own reference
// implementation — including that the `full_auto` and `some_access`
// branches are identical there. That's not a bug introduced by this port;
// it's copied exactly as specified. Only `manual` (always "ask") and a
// `blocked` risk classification (always "block", regardless of tier) behave
// differently from the other two tiers today. No C2 stub existed to
// replace — Track B hasn't started building against it in parallel yet, so
// this goes straight to the real implementation.
//
// Consumes the existing ACTION_RISK_MAP (packages/shared/src/actions.ts) —
// this function does not compute or duplicate risk classification, only
// the tier-based allow/ask/block decision on top of it.
export function policyDecision(action: WorkOrderAction, tier: PermissionTier): PolicyDecision {
  const risk = ACTION_RISK_MAP[action];

  if (risk === "blocked") return "block"; // never, regardless of tier

  if (tier === "full_auto") {
    return risk === "low" ? "allow" : "ask";
  }

  if (tier === "some_access") {
    return risk === "low" ? "allow" : "ask";
  }

  return "ask"; // manual: always ask
}

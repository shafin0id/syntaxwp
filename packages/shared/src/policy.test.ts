import { describe, expect, it } from "vitest";
import { ACTION_RISK_MAP, PermissionTierSchema, WORK_ORDER_ACTIONS } from "./actions.js";
import { policyDecision } from "./policy.js";

// Exhaustive over every (action, tier) combination in the system — §9.3's
// whole point is that this is a static, fully-enumerable decision table
// with no LLM involved, so the test can and should actually enumerate it
// rather than sampling a few cases.
describe("policyDecision — exhaustive (action, tier) coverage", () => {
  const tiers = PermissionTierSchema.options;

  for (const action of WORK_ORDER_ACTIONS) {
    for (const tier of tiers) {
      it(`(${action}, ${tier})`, () => {
        const risk = ACTION_RISK_MAP[action];
        const decision = policyDecision(action, tier);

        if (risk === "blocked") {
          expect(decision).toBe("block");
          return;
        }
        if (tier === "manual") {
          expect(decision).toBe("ask");
          return;
        }
        expect(decision).toBe(risk === "low" ? "allow" : "ask");
      });
    }
  }
});

describe("policyDecision — run_arbitrary_command is permanently blocked", () => {
  for (const tier of PermissionTierSchema.options) {
    it(`blocked under ${tier}`, () => {
      expect(policyDecision("run_arbitrary_command", tier)).toBe("block");
    });
  }
});

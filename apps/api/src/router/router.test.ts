import { describe, it, expect, vi } from "vitest";
import { routeLLMTask } from "./router.js";
import { FixIntentSchema, IncidentDiagnosisSchema } from "@syntaxwp/shared";

describe("Cognitive Router", () => {
  it("should match database connection signature on fast-path", async () => {
    const input = {
      logs: "Error establishing a database connection\nConnection refused at port 3306",
    };

    // Verify it returns database repair intent for FixIntentSchema
    const fixResult = await routeLLMTask({
      task: "fix",
      severity: "high",
      input,
      schema: FixIntentSchema,
    });

    expect(fixResult.action).toBe("repair_db");
    expect(fixResult.target).toBe("database");

    // Verify it returns database diagnosis for IncidentDiagnosisSchema
    const diagnosisResult = await routeLLMTask({
      task: "correlate",
      severity: "high",
      input,
      schema: IncidentDiagnosisSchema,
    });

    expect(diagnosisResult.root_cause).toBe("Database Connection Failure");
    expect(diagnosisResult.plain_english).toContain("unable to establish a connection");
  });

  it("should match corrupted WooCommerce file signature on fast-path", async () => {
    const input = {
      logs: "Fatal error: Class 'WC_Checkout' not found in /wp-content/plugins/woocommerce/includes/class-wc-checkout.php on line 12",
    };

    const fixResult = await routeLLMTask({
      task: "fix",
      severity: "high",
      input,
      schema: FixIntentSchema,
    });

    expect(fixResult.action).toBe("deactivate_plugin");
    expect(fixResult.target).toBe("woocommerce");
  });

  it("should return mock fallback when API credentials are absent", async () => {
    // Clear env keys temporarily to guarantee fallback path triggers
    const oldGeminiKey = process.env.GEMINI_API_KEY;
    const oldDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;

    try {
      const input = { logs: "Some unknown generic stacktrace error" };

      const fixResult = await routeLLMTask({
        task: "fix",
        severity: "medium",
        input,
        schema: FixIntentSchema,
      });

      expect(fixResult.action).toBe("deactivate_plugin");
      expect(fixResult.target).toBe("corrupt-helper-addon");
      expect(fixResult.reason).toContain("[Dev Mock]");
    } finally {
      process.env.GEMINI_API_KEY = oldGeminiKey;
      process.env.DEEPSEEK_API_KEY = oldDeepSeekKey;
    }
  });
});

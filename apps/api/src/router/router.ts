import { z, type ZodSchema } from "zod";
import { FixIntentSchema } from "@syntaxwp/shared";
import { IncidentDiagnosisSchema } from "@syntaxwp/shared";
import { env } from "../env.js";

// §7.1/§7.2 — LLM Router Task Definition
export type LLMTask = "classify" | "correlate" | "fix" | "safety" | "vision" | "async";
export type Severity = "high" | "medium" | "low";

export interface LLMRequest<TSchema extends ZodSchema = ZodSchema> {
  task: LLMTask;
  severity?: Severity;
  input: Record<string, unknown>;
  schema: TSchema;
}

// Task B4.1: Known-Signature Regex Matcher
function matchKnownSignature(input: Record<string, unknown>, schema: ZodSchema): any | null {
  const textToScan = JSON.stringify(input);

  // 1. Database Connection Failure
  if (/Error establishing a database connection/i.test(textToScan) || /mysqli_connect/i.test(textToScan)) {
    if (schema === IncidentDiagnosisSchema) {
      return {
        root_cause: "Database Connection Failure",
        evidence: ["Found database connection error signature in log stream"],
        confidence: 1.0,
        suspect_plugins: [],
        plain_english: "The site is unable to establish a connection to its MySQL database server.",
        escalate: false,
      };
    }
    if (schema === FixIntentSchema) {
      return {
        action: "repair_db",
        target: "database",
        reason: "Matched database connection offline signature in logs.",
        evidence_ids: ["db_conn_err_log"],
        confidence: 0.95,
        reversibility: "snapshot_required",
        risk: "high",
      };
    }
  }

  // 2. Corrupted WooCommerce files
  if (/woocommerce/i.test(textToScan) && (/failed to open stream/i.test(textToScan) || /Class .*not found/i.test(textToScan))) {
    if (schema === IncidentDiagnosisSchema) {
      return {
        root_cause: "Corrupted WooCommerce Files",
        evidence: ["Found class load or include failures referencing WooCommerce path"],
        confidence: 1.0,
        suspect_plugins: ["woocommerce"],
        plain_english: "A critical WooCommerce core file appears to be corrupted or missing.",
        escalate: false,
      };
    }
    if (schema === FixIntentSchema) {
      return {
        action: "deactivate_plugin",
        target: "woocommerce",
        reason: "Deactivating suspected corrupted WooCommerce build to restore site baseline.",
        evidence_ids: ["woocommerce_corrupt_log"],
        confidence: 0.9,
        reversibility: "instant",
        risk: "medium",
      };
    }
  }

  // 3. Visual regression styling mismatch
  if (/Visual diff mismatch/i.test(textToScan) || /layout shift/i.test(textToScan)) {
    if (schema === IncidentDiagnosisSchema) {
      return {
        root_cause: "Cached Style Drift",
        evidence: ["Visual comparison spotted styling misalignment"],
        confidence: 0.8,
        suspect_plugins: [],
        plain_english: "Cached CSS styles have drifted from staging baselines.",
        escalate: false,
      };
    }
    if (schema === FixIntentSchema) {
      return {
        action: "flush_cache",
        target: "site",
        reason: "Matched layout drift; flushing styling caches to realign visual tree.",
        evidence_ids: ["visual_drift_log"],
        confidence: 0.85,
        reversibility: "instant",
        risk: "low",
      };
    }
  }

  return null;
}

// Native model query helper
async function callModel(prompt: string, useDeepSeek: boolean): Promise<string> {
  if (useDeepSeek) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured.");

    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(10000), // timeout guard
    });

    if (!res.ok) {
      throw new Error(`DeepSeek API error: HTTP ${res.status} | ${await res.text()}`);
    }
    const json = (await res.json()) as any;
    return json.choices?.[0]?.message?.content || "";
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

    // Avoid query param API key for security log exposure
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey 
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
      signal: AbortSignal.timeout(10000), // timeout guard
    });

    if (!res.ok) {
      throw new Error(`Gemini API error: HTTP ${res.status} | ${await res.text()}`);
    }
    const json = (await res.json()) as any;
    return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
}

// Main cognitive router entry point
export async function routeLLMTask<TSchema extends ZodSchema>(req: LLMRequest<TSchema>): Promise<z.infer<TSchema>> {
  const { task, severity, input, schema } = req;

  console.log(`Cognitive Router - Incoming task: ${task} | Severity: ${severity || "none"}`);

  // 1. Check known regex signature fast-path
  const signatureMatch = matchKnownSignature(input, schema);
  if (signatureMatch) {
    console.log(`Fast-path matched known signature. Bypassing LLM.`);
    return signatureMatch;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  // 2. Check if API keys exist. If both are missing, use dynamic fallback mock data
  if (!geminiKey && !deepseekKey) {
    console.warn("No LLM API keys detected. Falling back to structured dev mock response.");
    if ((schema as any) === FixIntentSchema) {
      return {
        action: "deactivate_plugin",
        target: "corrupt-helper-addon",
        reason: "[Dev Mock] Deactivating corrupted addon plugin.",
        evidence_ids: ["mock_err_log_evidence"],
        confidence: 0.9,
        reversibility: "instant",
        risk: "medium",
      } as any;
    }
    if ((schema as any) === IncidentDiagnosisSchema) {
      return {
        root_cause: "[Dev Mock] Plugin conflict in class-helper loader",
        evidence: ["Mock logs showed class loading failure in helper-addon"],
        confidence: 0.95,
        suspect_plugins: ["corrupt-helper-addon"],
        plain_english: "A plugin conflict occurred in the helper-addon loading routine.",
        escalate: false,
      } as any;
    }
    throw new Error("Missing LLM credentials and requested schema has no mock fallback.");
  }

  // 3. Routing decision logic:
  // - Classify, vision, or low severity tasks go to Gemini 2.5 Flash-Lite
  // - Complex diagnosis (correlate, fix, safety) or high/medium severity tasks go to DeepSeek
  const useDeepSeek = (task === "correlate" || task === "fix" || task === "safety" || task === "async") && severity !== "low";
  console.log(`Routing task to model: ${useDeepSeek ? "DeepSeek-Chat" : "Gemini-2.5-Flash-Lite"}`);

  const schemaDescription = (schema as any) === FixIntentSchema
    ? "FixIntentSchema: { action: enum(deactivate_plugin, activate_plugin, update_plugin, flush_cache, clear_transients, disable_maintenance_mode, toggle_debug, repair_db, switch_theme, update_core, delete_plugin, update_option), target: string, reason: string, evidence_ids: string[], confidence: number(0-1), reversibility: enum(instant, snapshot_required, manual_only), risk: enum(low, medium, high) }"
    : "IncidentDiagnosisSchema: { root_cause: string, evidence: string[], confidence: number(0-1), suspect_plugins: string[], plain_english: string, escalate: boolean }";

  let retries = 2;
  let lastErrorMsg = "";

  while (retries >= 0) {
    // Delimit input with XML-style tags to prevent prompt injection hijacking
    let prompt = `You are a WordPress intelligence assistant. Return ONLY a JSON object strictly conforming to this schema contract:
${schemaDescription}

<INPUT_DATA>
${JSON.stringify(input, null, 2)}
</INPUT_DATA>
Analyze the INPUT_DATA above and return the JSON object.`;

    if (lastErrorMsg) {
      // Error-only retry prompt (do not re-inject raw model output to prevent injection feedback)
      prompt += `\n\nERROR: Your previous output failed schema validation:
Validation error: ${lastErrorMsg}
Please output a clean, valid JSON object fixing these schema errors.`;
    }

    try {
      const rawOutput = await callModel(prompt, useDeepSeek);
      const parsedJson = JSON.parse(rawOutput);
      const validation = schema.safeParse(parsedJson);

      if (validation.success) {
        const data = validation.data;
        // Prevent LLM action escape to run_arbitrary_command
        if (data && typeof data === "object" && "action" in data && data.action === "run_arbitrary_command") {
          lastErrorMsg = "Action 'run_arbitrary_command' is forbidden for automated LLM fixes.";
          console.warn("LLM attempted to generate forbidden action: run_arbitrary_command");
        } else {
          console.log("LLM response successfully validated.");
          return data;
        }
      } else {
        lastErrorMsg = JSON.stringify(validation.error.flatten());
        console.warn(`Validation failed. Error detail: ${lastErrorMsg}`);
      }
    } catch (err: any) {
      lastErrorMsg = err.message || err;
      console.warn(`Error during LLM fetch or parse: ${err.message}`);
    }

    retries--;
  }

  throw new Error(`Cognitive router failed to produce a valid response after retries. Last error: ${lastErrorMsg}`);
}

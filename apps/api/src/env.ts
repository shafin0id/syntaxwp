import "dotenv/config";
import { z } from "zod";

// Fail fast on missing config rather than surfacing a confusing runtime
// error later. Only variables actually read by current code are required —
// LLM/billing keys are reserved for tracks that don't exist yet.
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  // A5a.1: the hardcoded CORS origin from Task 1 needed to become
  // configurable once anything beyond localhost:3000 exists.
  DASHBOARD_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is not set — see LOCAL-DEVELOPMENT-SETUP.md §4"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  CF_WORKER_SECRET: z.string().min(1),
  // Base64-encoded 32-byte AES-256 key for encrypting sites.site_secret_ciphertext
  // at rest (A2.4) — see packages/shared/src/site-secret.ts for the format.
  SITE_SECRET_ENCRYPTION_KEY: z.string().min(1),

  // Reserved for Track B (LLM router) / billing — not read by any Task 1 code.
  DEEPSEEK_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid apps/api environment configuration:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;

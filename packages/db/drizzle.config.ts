import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Falls back to the default local Supabase DB URL (see LOCAL-DEVELOPMENT-SETUP.md
// §4) so `drizzle-kit generate` works without a .env file present — only
// `migrate`/`push`/`studio` actually need a reachable database.
const DEFAULT_LOCAL_DATABASE_URL = "postgresql://postgres:postgres@localhost:54322/postgres";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL,
  },
});

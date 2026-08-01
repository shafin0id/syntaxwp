import { db, sql, orgs } from "@syntaxwp/db";
import { desc } from "drizzle-orm";
import { supabaseAdmin } from "./supabase.js";

// Local dev only — never used against a real Supabase project. See
// LOCAL-DEVELOPMENT-SETUP.md §6 for how this is used to test `requireSession`.
const DEV_EMAIL = "dev@syntaxwp.local";
const DEV_PASSWORD = "syntaxwp-dev-password";

async function main() {
  // Requires `pnpm --filter @syntaxwp/db seed` to have already run — the dev
  // user's org_id claim (see getOrgIdFromUser, auth/middleware.ts) points at
  // whatever org that script most recently created.
  const [latestOrg] = await db.select().from(orgs).orderBy(desc(orgs.createdAt)).limit(1);
  if (!latestOrg) {
    console.error("no org found — run `pnpm --filter @syntaxwp/db seed` first");
    await sql.end();
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
    email_confirm: true,
    app_metadata: { org_id: latestOrg.id },
  });

  await sql.end();

  if (error) {
    console.error("failed to create dev user:", error.message);
    process.exit(1);
  }

  console.log("seeded dev user:", data.user.id, DEV_EMAIL, "org:", latestOrg.id);
  console.log("dev password:", DEV_PASSWORD);
}

main();

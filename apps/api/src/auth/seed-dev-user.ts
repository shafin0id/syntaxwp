import { supabaseAdmin } from "./supabase.js";

// Local dev only — never used against a real Supabase project. See
// LOCAL-DEVELOPMENT-SETUP.md §6 for how this is used to test `requireSession`.
const DEV_EMAIL = "dev@syntaxwp.local";
const DEV_PASSWORD = "syntaxwp-dev-password";

async function main() {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
    email_confirm: true,
  });

  if (error) {
    console.error("failed to create dev user:", error.message);
    process.exit(1);
  }

  console.log("seeded dev user:", data.user.id, DEV_EMAIL);
  console.log("dev password:", DEV_PASSWORD);
}

main();

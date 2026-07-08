import { encryptSiteSecret, generateSiteSecret, loadSiteSecretEncryptionKey } from "@syntaxwp/shared";
import { db, sql } from "./client.js";
import { orgs, sites } from "./schema/index.js";

// Creates one dev org + one dev site with a generated site_secret, per Task
// 1.5. Safe to run repeatedly against a fresh local DB (`supabase db reset`
// then re-seed) — it does not check for an existing dev org first, since
// local data is disposable by design (see LOCAL-DEVELOPMENT-SETUP.md §4).
async function main() {
  // Reads process.env directly (not a Zod schema, unlike apps/api) since
  // this script runs standalone outside apps/api — loadSiteSecretEncryptionKey
  // itself is what fails fast here if the var is missing/wrong-length (A2.4).
  const encryptionKey = loadSiteSecretEncryptionKey(process.env.SITE_SECRET_ENCRYPTION_KEY);

  const [org] = await db
    .insert(orgs)
    .values({ name: "Dev Org", plan: "starter" })
    .returning();

  const siteSecret = generateSiteSecret();

  const [site] = await db
    .insert(sites)
    .values({
      orgId: org.id,
      url: "http://localhost:8080",
      executionPath: "legacy_outbound",
      siteSecretCiphertext: encryptSiteSecret(siteSecret, encryptionKey),
    })
    .returning();

  console.log("seeded dev org:", org.id);
  console.log("seeded dev site:", site.id);
  console.log("dev site_secret:", siteSecret);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { randomBytes } from "node:crypto";
import { db, sql } from "./client.js";
import { orgs, sites } from "./schema/index.js";

// Creates one dev org + one dev site with a generated site_secret, per Task
// 1.5. Safe to run repeatedly against a fresh local DB (`supabase db reset`
// then re-seed) — it does not check for an existing dev org first, since
// local data is disposable by design (see LOCAL-DEVELOPMENT-SETUP.md §4).
async function main() {
  const [org] = await db
    .insert(orgs)
    .values({ name: "Dev Org", plan: "starter" })
    .returning();

  const siteSecret = randomBytes(32).toString("hex");

  const [site] = await db
    .insert(sites)
    .values({
      orgId: org.id,
      url: "http://localhost:8080",
      executionPath: "legacy_outbound",
      siteSecret,
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

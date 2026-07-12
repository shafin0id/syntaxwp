import { db, sql } from "./client.js";
import { sites } from "./schema/index.js";
import { eq } from "drizzle-orm";

async function main() {
  const allSites = await db.select().from(sites);
  console.log("Current DB Sites:");
  console.log(allSites);

  // If there's a site, let's update its URL to http://wp1.local so it connects to the user's running local site
  if (allSites.length > 0) {
    const targetSite = allSites[0];
    await db.update(sites).set({
      url: "http://wp1.local",
      wpVersion: "6.5.3", // local version
      wpAdminUser: "admin",
      wpAdminPassword: "password", // default fallback
    }).where(eq(sites.id, targetSite.id));
    console.log(`Updated site ${targetSite.id} URL to http://wp1.local`);
  }

  await sql.end();
}

main().catch(console.error);

import { db, sql } from "./client.js";
import { sites } from "./schema/index.js";
import { eq } from "drizzle-orm";

async function main() {
  const result = await db
    .update(sites)
    .set({
      title: "wp1",
    })
    .where(eq(sites.url, "http://wp1.local"));

  console.log("Updated http://wp1.local site title to wp1");
  await sql.end();
}

main().catch(console.error);

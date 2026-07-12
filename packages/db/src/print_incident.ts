import { db, sql } from "./client.js";
import { incidents } from "./schema/index.js";

async function main() {
  const list = await db.select().from(incidents);
  console.log("All incidents in DB:", list);
  await sql.end();
}

main().catch(console.error);

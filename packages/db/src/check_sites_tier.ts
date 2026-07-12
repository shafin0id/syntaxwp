import { db, sql } from "./client.js";
import { sites } from "./schema/index.js";

async function main() {
  const list = await db.select().from(sites);
  console.log("Current Sites DB Status:", list);
  await sql.end();
}

main().catch(console.error);

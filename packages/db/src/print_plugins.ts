import { db, sql } from "./client.js";
import { pluginInventory } from "./schema/index.js";

async function main() {
  const list = await db.select().from(pluginInventory);
  console.log("Plugins Inventory in DB:", list);
  await sql.end();
}

main().catch(console.error);

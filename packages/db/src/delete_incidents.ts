import { db } from "./client.js";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`TRUNCATE TABLE incidents CASCADE`);
  await db.execute(sql`TRUNCATE TABLE audit_log CASCADE`);
  console.log("Database incidents and audit logs truncated successfully.");
}

main().catch(console.error);

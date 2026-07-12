import { db } from "./client.js";
import { auditLog } from "./schema/index.js";

async function main() {
  const logs = await db.select().from(auditLog).orderBy(auditLog.createdAt);
  console.log("All audit logs in DB:", logs);
  process.exit(0);
}

main().catch(console.error);

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./client.js";

async function main() {
  await migrate(db, { migrationsFolder: "./migrations" });
  console.log("migrations applied");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

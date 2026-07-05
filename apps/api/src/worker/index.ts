import { run } from "graphile-worker";
import { env } from "../env.js";
import { taskList } from "./tasks/index.js";

async function main() {
  const runner = await run({
    connectionString: env.DATABASE_URL,
    taskList,
  });
  console.log("listening for jobs");
  await runner.promise;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Standalone trigger for manual performance-ping verification (Task 5)
// Run: pnpm --filter @syntaxwp/api exec tsx src/scripts/trigger-perf-ping.ts
import { performancePing } from "../worker/tasks/performance-ping.js";
import { sql } from "@syntaxwp/db";

console.log("=== Triggering performance-ping manually ===");
await performancePing({} as any, {} as any);
console.log("=== Done ===");
await sql.end();

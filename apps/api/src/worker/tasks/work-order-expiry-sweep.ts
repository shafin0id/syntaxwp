import type { Task } from "graphile-worker";
import { db, expireStaleWorkOrders } from "@syntaxwp/db";

// A3.2 — runs every minute (see apps/api/crontab). Garbage-collects work
// orders nobody claimed within the 5-minute window (§8.2) so a stale
// "pending" row doesn't sit around looking claimable forever.
export const workOrderExpirySweep: Task = async () => {
  const count = await expireStaleWorkOrders(db);
  if (count > 0) {
    console.log(`[work_order_expiry_sweep] expired ${count} stale work order(s)`);
  }
};

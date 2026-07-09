import type { Task } from "graphile-worker";
import { deadMansSwitchFire } from "./dead-mans-switch.js";
import { siteAuthNoncePrune } from "./site-auth-nonce-prune.js";
import { workOrderExpirySweep } from "./work-order-expiry-sweep.js";

// Placeholders only — real implementations land in Task B9
// (vulnerability_feed_sync) and Task B2 (heartbeat_drift_check). Reserving
// the task names now so downstream tasks just fill in the body instead of
// also wiring registration.
const vulnerabilityFeedSync: Task = async () => {
  console.log("[placeholder] vulnerability_feed_sync");
};

const heartbeatDriftCheck: Task = async () => {
  console.log("[placeholder] heartbeat_drift_check");
};

export const taskList = {
  dead_mans_switch_fire: deadMansSwitchFire,
  vulnerability_feed_sync: vulnerabilityFeedSync,
  heartbeat_drift_check: heartbeatDriftCheck,
  site_auth_nonce_prune: siteAuthNoncePrune,
  work_order_expiry_sweep: workOrderExpirySweep,
};

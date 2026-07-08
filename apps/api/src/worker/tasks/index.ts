import type { Task } from "graphile-worker";
import { siteAuthNoncePrune } from "./site-auth-nonce-prune.js";

// Placeholders only — real implementations land in Task A4
// (dead_mans_switch_fire), Task B9 (vulnerability_feed_sync), and Task B2
// (heartbeat_drift_check). Reserving the task names now so downstream tasks
// just fill in the body instead of also wiring registration.
const deadMansSwitchFire: Task = async (payload) => {
  console.log("[placeholder] dead_mans_switch_fire", payload);
};

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
};

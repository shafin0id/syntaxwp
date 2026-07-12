import type { Task } from "graphile-worker";
import { deadMansSwitchFire } from "./dead-mans-switch.js";
import { siteAuthNoncePrune } from "./site-auth-nonce-prune.js";
import { snapshotRetentionSweep } from "./snapshot-retention.js";
import { workOrderExpirySweep } from "./work-order-expiry-sweep.js";
import { vulnerabilityFeedSync } from "./vulnerability-sync.js";
import { sslDomainWatch } from "./ssl-domain-watch.js";
import { performanceCollector } from "./performance-collector.js";
import { performancePing } from "./performance-ping.js";
import { syntheticCheckoutCheck } from "./synthetic-checkout.js";
import { fixPipeline } from "./fix-pipeline.js";
import { safeUpdateVerifier } from "./safe-update-verifier.js";

const heartbeatDriftCheck: Task = async () => {
  console.log("[placeholder] heartbeat_drift_check");
};

export const taskList = {
  dead_mans_switch_fire: deadMansSwitchFire,
  vulnerability_feed_sync: vulnerabilityFeedSync,
  ssl_domain_watch: sslDomainWatch,
  performance_collector: performanceCollector,
  performance_ping: performancePing,
  synthetic_checkout_check: syntheticCheckoutCheck,
  fix_pipeline: fixPipeline,
  safe_update_verification: safeUpdateVerifier,
  heartbeat_drift_check: heartbeatDriftCheck,
  site_auth_nonce_prune: siteAuthNoncePrune,
  work_order_expiry_sweep: workOrderExpirySweep,
  snapshot_retention_sweep: snapshotRetentionSweep,
};

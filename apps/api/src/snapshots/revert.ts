import {
  db,
  getSiteById,
  getSnapshotForWorkOrder,
  getWorkOrderById,
  insertAuditLog,
  issueWorkOrder,
  markWorkOrderReverted,
} from "@syntaxwp/db";
import {
  decryptSiteSecret,
  loadSiteSecretEncryptionKey,
  type RiskLevel,
  type WorkOrderAction,
} from "@syntaxwp/shared";
import { env } from "../env.js";

const encryptionKey = loadSiteSecretEncryptionKey(env.SITE_SECRET_ENCRYPTION_KEY);

// Actions with a clean, mechanical inverse expressible with data this
// system already has (the original work order's own target). Every other
// action either has no meaningful inverse (flush_cache, toggle_debug) or
// needs data this platform can't yet read back off a site (the pre-update
// plugin/core version for update_plugin/update_core, prior option values
// for update_option) — Task A7's execution path is what will eventually let
// the plugin report that state back for a snapshot to actually capture it.
const INVERSE_ACTION: Partial<Record<WorkOrderAction, WorkOrderAction>> = {
  deactivate_plugin: "activate_plugin",
  activate_plugin: "deactivate_plugin",
};

export interface RevertResult {
  correctiveWorkOrderId: string | null;
  snapshotId: string | null;
  siteReachable: boolean;
}

// §8.1's "Verification FAILED (or switch fires)" branch. Always escalates
// to a human afterward (a separate audit_log entry below) regardless of
// whether an automatic corrective action could be queued — tripping the
// switch or failing verification means something went wrong enough that a
// human should look, whether or not this function could also fix it.
export async function executeRevert(workOrderId: string): Promise<RevertResult> {
  const workOrder = await getWorkOrderById(db, workOrderId);
  if (!workOrder) {
    throw new Error(`executeRevert: work order ${workOrderId} not found`);
  }

  const site = await getSiteById(db, workOrder.siteId);
  if (!site) {
    throw new Error(`executeRevert: site ${workOrder.siteId} not found`);
  }

  const snapshot = await getSnapshotForWorkOrder(db, workOrderId);

  let correctiveWorkOrderId: string | null = null;
  const inverseAction = INVERSE_ACTION[workOrder.action as WorkOrderAction];
  if (inverseAction && workOrder.target) {
    // System-initiated safety action, not a user request — bypasses the
    // policy engine (issueWorkOrderWithPolicy) on purpose. Requiring a
    // human "ask" approval to undo damage the system itself caused would
    // leave a known-bad state in place until someone clicks a button;
    // §8.1's flow treats auto-revert as unconditional.
    const siteSecret = decryptSiteSecret(site.siteSecretCiphertext, encryptionKey);
    const { row } = await issueWorkOrder(db, {
      siteId: site.id,
      incidentId: workOrder.incidentId ?? undefined,
      action: inverseAction,
      target: workOrder.target,
      risk: workOrder.risk as RiskLevel,
      deadMansSwitchMs: workOrder.deadMansSwitchMs,
      siteSecret,
      initialStatus: "pending",
    });
    correctiveWorkOrderId = row.id;
  }

  const siteReachable = await probeSiteHealth(site.url);

  await markWorkOrderReverted(db, workOrderId, {
    correctiveWorkOrderId,
    snapshotId: snapshot?.id ?? null,
    siteReachableAtRevert: siteReachable,
  });

  await insertAuditLog(db, {
    siteId: site.id,
    incidentId: workOrder.incidentId,
    workOrderId: workOrder.id,
    eventType: "work_order_reverted",
    actor: "system",
    summary: correctiveWorkOrderId
      ? `Auto-reverted ${workOrder.action} on ${workOrder.target} by queuing corrective work order ${correctiveWorkOrderId}`
      : `No automatic inverse exists for ${workOrder.action} — snapshot preserved, manual revert required`,
    evidence: { snapshotId: snapshot?.id ?? null, correctiveWorkOrderId, siteReachable },
  });

  await insertAuditLog(db, {
    siteId: site.id,
    incidentId: workOrder.incidentId,
    workOrderId: workOrder.id,
    eventType: "revert_escalated_to_human",
    actor: "system",
    summary: "Escalated to a human for review after auto-revert",
    evidence: { siteReachable },
  });

  return { correctiveWorkOrderId, snapshotId: snapshot?.id ?? null, siteReachable };
}

// A real HTTP round trip against the site's public URL, not a stub — but
// not the full Playwright-based health check from §9.1 either (screenshots,
// visual diff, WooCommerce checkout probe). That verification pipeline is
// Track B's territory and doesn't exist yet. This only answers "is the
// origin still serving something at all," which is still meaningful
// evidence to attach to a revert/escalation record.
export async function probeSiteHealth(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { method: "GET", signal: controller.signal });
      return res.status < 500;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return false;
  }
}

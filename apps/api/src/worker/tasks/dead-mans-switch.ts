import { makeWorkerUtils, type Task, type WorkerUtils } from "graphile-worker";
import { db, getWorkOrderById, insertAuditLog, sql } from "@syntaxwp/db";
import { env } from "../../env.js";
import { executeRevert } from "../../snapshots/revert.js";

// Deterministic from the work order id alone — arm/disarm never need to
// track a separate Graphile Worker job id, and arming twice for the same
// work order (e.g. a retried execution report, A5b) replaces the existing
// scheduled fire (jobKeyMode defaults to "replace") instead of duplicating
// it.
function jobKeyFor(workOrderId: string): string {
  return `dms_${workOrderId}`;
}

// graphile-worker's own docs: "if you need to call [addJob] more than once
// in your process you should instead create a WorkerUtils instance for
// efficiency." arm/disarm will be called once per executed work order for
// the life of this process, so a single lazily-created instance is reused
// rather than paying makeWorkerUtils's setup (which also runs a schema
// migration check) on every call. Lazy rather than eager so importing this
// module — which the worker's task registry does unconditionally — has no
// side effect for processes/tests that never actually arm a switch.
let workerUtilsPromise: Promise<WorkerUtils> | undefined;
function getWorkerUtils(): Promise<WorkerUtils> {
  if (!workerUtilsPromise) {
    workerUtilsPromise = makeWorkerUtils({ connectionString: env.DATABASE_URL });
  }
  return workerUtilsPromise;
}

// §9.2 — armed the moment a work order's execution is reported (call site:
// the execution-report endpoint Task A5b adds). If disarm never happens
// within timeoutMs, deadMansSwitchFire below fires and reverts.
export async function armDeadMansSwitch(workOrderId: string, timeoutMs: number): Promise<void> {
  const utils = await getWorkerUtils();
  await utils.addJob(
    "dead_mans_switch_fire",
    { workOrderId },
    { jobKey: jobKeyFor(workOrderId), runAt: new Date(Date.now() + timeoutMs) },
  );
}

// Called when a healthy post-deploy heartbeat/verification arrives (call
// site: also Task A5b). graphile_worker.remove_job is a SQL function, not
// exposed on WorkerUtils' JS interface in the installed graphile-worker
// 0.16.6 — calling it directly through the same `sql` client packages/db
// already exports avoids opening a second connection pool just for this.
// A no-op (not an error) if the job already fired or was never armed —
// disarming something that isn't armed isn't a failure case.
export async function disarmDeadMansSwitch(workOrderId: string): Promise<void> {
  await sql`select graphile_worker.remove_job(${jobKeyFor(workOrderId)})`;
}

// The job that fires if disarm never happens. Re-checks the work order's
// current status first: this is a fast defensive short-circuit against a
// stale/duplicate fire (e.g. Graphile Worker's at-least-once delivery
// retrying after a crash mid-run), not the actual concurrency guard against
// a disarm racing a fire — that guard lives in executeRevert's call to
// markWorkOrderReverted, which conditions its UPDATE on status='executed'
// at the database level.
//
// Writes its own "dead_mans_switch_fired" audit_log entry (§9.2's
// `createAlert`/`notifyOwner` pseudocode — there's no notification channel
// to actually page/email anyone yet, that's Track B/A9 territory, so this
// is the alert record itself) *before* calling executeRevert, which is
// deliberately caller-agnostic about *why* a work order is being reverted
// (it's also meant to be called from a failed-verification path, Track B,
// that has nothing to do with this timer). Distinguishing "the switch fired"
// from "verification failed" belongs to the caller, not to the shared
// revert executor.
export const deadMansSwitchFire: Task = async (payload) => {
  const { workOrderId } = payload as { workOrderId: string };
  const workOrder = await getWorkOrderById(db, workOrderId);
  if (!workOrder || workOrder.status !== "executed") {
    return;
  }

  await insertAuditLog(db, {
    siteId: workOrder.siteId,
    incidentId: workOrder.incidentId,
    workOrderId: workOrder.id,
    eventType: "dead_mans_switch_fired",
    actor: "system",
    summary: `Dead man's switch fired for ${workOrder.action} — no disarm received within the timeout window`,
  });

  await executeRevert(workOrderId);
};

// Test-only escape hatch: releases the cached WorkerUtils connection so a
// vitest process can exit cleanly after a test calls armDeadMansSwitch.
// Production code (the worker process, the API process) never calls this —
// the singleton is meant to live for the process's whole lifetime.
export async function _releaseWorkerUtilsForTests(): Promise<void> {
  if (workerUtilsPromise) {
    const utils = await workerUtilsPromise;
    await utils.release();
    workerUtilsPromise = undefined;
  }
}

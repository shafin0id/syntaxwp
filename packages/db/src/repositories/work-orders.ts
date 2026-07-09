import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import {
  policyDecision,
  signWorkOrder,
  WORK_ORDER_STATUSES,
  type PermissionTier,
  type PolicyDecision,
  type RiskLevel,
  type WorkOrder,
  type WorkOrderAction,
} from "@syntaxwp/shared";
import type { Database } from "../client.js";
import { sites, workOrders } from "../schema/index.js";

export type WorkOrderRow = typeof workOrders.$inferSelect;

// §8.2's 5-minute claim window.
const DEFAULT_EXPIRY_MS = 5 * 60 * 1000;

export interface IssueWorkOrderInput {
  siteId: string;
  incidentId?: string;
  action: WorkOrderAction;
  target?: string;
  parameters?: Record<string, unknown>;
  risk: RiskLevel;
  deadMansSwitchMs: number;
  siteSecret: string; // plaintext — caller decrypts via A2.4's decryptSiteSecret first
  expiresInMs?: number;
  // Defaults to "pending" (immediately claimable). issueWorkOrderWithPolicy
  // below is what actually decides this based on §9.3's policyDecision —
  // most callers should use that instead of calling issueWorkOrder directly
  // with a status, unless they have their own reason to bypass the policy
  // gate (there currently are none; this parameter exists so the policy
  // wrapper doesn't need a second, near-duplicate insert implementation).
  initialStatus?: (typeof WORK_ORDER_STATUSES)[number];
}

export interface IssuedWorkOrder {
  row: WorkOrderRow;
  // The actual signed payload sent to the plugin — built here rather than
  // re-derived from `row` later, since re-deriving would mean reconstructing
  // exactly the same field set/ordering the signature was computed over.
  wirePayload: WorkOrder;
}

// The only place a work order's HMAC is computed. `id` doubles as the
// replay nonce (see packages/shared/src/work-order-signing.ts) — generated
// here, before signing, rather than left to the DB's default so it can be
// included in the signed payload.
export async function issueWorkOrder(
  db: Database,
  input: IssueWorkOrderInput,
): Promise<IssuedWorkOrder> {
  const id = randomUUID();
  const issuedAtMs = Date.now();
  const expiresAtMs = issuedAtMs + (input.expiresInMs ?? DEFAULT_EXPIRY_MS);

  const unsigned = {
    id,
    site_id: input.siteId,
    action: input.action,
    target: input.target ?? "",
    parameters: input.parameters ?? {},
    issued_at: Math.floor(issuedAtMs / 1000),
    expires_at: Math.floor(expiresAtMs / 1000),
    dead_mans_switch_ms: input.deadMansSwitchMs,
  };
  const hmac = signWorkOrder(unsigned, input.siteSecret);

  const [row] = await db
    .insert(workOrders)
    .values({
      id,
      siteId: input.siteId,
      incidentId: input.incidentId,
      action: input.action,
      target: input.target,
      parameters: input.parameters,
      risk: input.risk,
      hmac,
      deadMansSwitchMs: input.deadMansSwitchMs,
      issuedAt: new Date(issuedAtMs),
      expiresAt: new Date(expiresAtMs),
      ...(input.initialStatus ? { status: input.initialStatus } : {}),
    })
    .returning();

  return { row, wirePayload: { ...unsigned, hmac } };
}

export type IssueWorkOrderWithPolicyResult =
  | { decision: Extract<PolicyDecision, "allow" | "ask">; workOrder: IssuedWorkOrder }
  | { decision: Extract<PolicyDecision, "block">; workOrder: undefined };

// The policy gate (A3.3) sitting between "something wants to issue a work
// order" and "a work order exists": every issuance that should be subject
// to §9.3's tier enforcement goes through this, not issueWorkOrder directly.
// A "block" decision never creates a row at all — there is nothing to
// approve, decline, or audit for an action the system will never perform,
// regardless of who's asking. An "ask" decision still signs and persists
// the work order (so its evidence/reasoning exists for the approval UI to
// show), just starting in "awaiting_approval" instead of "pending" so the
// plugin's claim endpoint (A5b.1) can't pick it up until a user approves it.
export async function issueWorkOrderWithPolicy(
  db: Database,
  input: IssueWorkOrderInput & { tier: PermissionTier },
): Promise<IssueWorkOrderWithPolicyResult> {
  const decision = policyDecision(input.action, input.tier);
  if (decision === "block") {
    return { decision, workOrder: undefined };
  }

  const issued = await issueWorkOrder(db, {
    ...input,
    initialStatus: decision === "ask" ? "awaiting_approval" : "pending",
  });
  return { decision, workOrder: issued };
}

// Joins through sites to enforce that the requesting dashboard user's org
// actually owns the site this work order targets — mirrors
// getSiteByIdForOrg's org-scoping rationale in repositories/sites.ts.
export async function getWorkOrderForOrg(
  db: Database,
  workOrderId: string,
  orgId: string,
): Promise<WorkOrderRow | undefined> {
  const [row] = await db
    .select({ workOrder: workOrders })
    .from(workOrders)
    .innerJoin(sites, eq(workOrders.siteId, sites.id))
    .where(and(eq(workOrders.id, workOrderId), eq(sites.orgId, orgId)));
  return row?.workOrder;
}

// Both approve/decline are conditioned on the row currently being
// "awaiting_approval" in the UPDATE's WHERE clause — this makes the
// transition atomic (no read-then-write race between two approval clicks)
// and means an undefined return unambiguously signals "not in a state this
// operation applies to" (already approved/declined/expired/claimed), which
// the route layer turns into a 409, not a silent no-op.
export async function approveWorkOrder(
  db: Database,
  workOrderId: string,
): Promise<WorkOrderRow | undefined> {
  const [row] = await db
    .update(workOrders)
    .set({ status: "pending" })
    .where(and(eq(workOrders.id, workOrderId), eq(workOrders.status, "awaiting_approval")))
    .returning();
  return row;
}

export async function declineWorkOrder(
  db: Database,
  workOrderId: string,
): Promise<WorkOrderRow | undefined> {
  const [row] = await db
    .update(workOrders)
    .set({ status: "declined" })
    .where(and(eq(workOrders.id, workOrderId), eq(workOrders.status, "awaiting_approval")))
    .returning();
  return row;
}

export async function getWorkOrderById(db: Database, id: string): Promise<WorkOrderRow | undefined> {
  const [row] = await db.select().from(workOrders).where(eq(workOrders.id, id));
  return row;
}

// A3.2's Graphile Worker sweep calls this every minute. Only ever moves
// pending -> expired; never touches a claimed/executed/reverted order, even
// if its expires_at has long since passed — expiry only means "the window
// to *claim* this order closed," not "undo what already happened."
export async function expireStaleWorkOrders(db: Database): Promise<number> {
  const expired = await db
    .update(workOrders)
    .set({ status: "expired" })
    .where(and(eq(workOrders.status, "pending"), lt(workOrders.expiresAt, new Date())))
    .returning({ id: workOrders.id });
  return expired.length;
}

// A4.3's revert executor calls this once it has done what it can to undo an
// executed work order. Guarded on the row currently being "executed" — the
// same atomic-transition pattern as approve/decline above — so a work order
// that was never executed can't be marked reverted, and one already
// reverted (e.g. a retried dead-man's-switch fire racing a disarm) can't be
// "re-reverted" and double-issue a corrective work order.
// Reconstructs the exact unsigned-payload shape `issueWorkOrder` computed
// the HMAC over (see the `unsigned` object above), from a persisted row —
// so a claiming plugin can verify the same signature the server produced at
// issuance. `Math.floor(date.getTime() / 1000)` mirrors the truncation
// `issueWorkOrder` applied going in; Postgres's microsecond timestamp
// precision means the round-trip loses nothing `issued_at`/`expires_at`
// didn't already lack.
export function workOrderToWirePayload(row: WorkOrderRow): WorkOrder {
  return {
    id: row.id,
    site_id: row.siteId,
    action: row.action as WorkOrderAction,
    target: row.target ?? "",
    parameters: (row.parameters as Record<string, unknown>) ?? {},
    issued_at: Math.floor((row.issuedAt ?? new Date()).getTime() / 1000),
    expires_at: Math.floor(row.expiresAt.getTime() / 1000),
    dead_mans_switch_ms: row.deadMansSwitchMs,
    hmac: row.hmac,
  };
}

// A5b.1's claim endpoint. The legacy (pre-WP7) plugin execution path is
// outbound-only (§4.1) — it can't be pushed a work order's id, so discovery
// and claiming happen in one atomic statement: pick the site's oldest
// pending order and claim it in the same UPDATE, rather than a separate
// "list pending" call followed by a claim-by-id call (which would open a
// TOCTOU window between the two, and needs its own endpoint besides). A
// single UPDATE...WHERE id = (SELECT ...) is still one atomic operation from
// Postgres's perspective — no read-then-write race between two concurrent
// pollers for the same site, since the subquery's row lock is taken as part
// of the same statement.
export async function claimNextPendingWorkOrder(
  db: Database,
  siteId: string,
): Promise<WorkOrderRow | undefined> {
  const [row] = await db
    .update(workOrders)
    .set({ status: "claimed", claimedAt: new Date() })
    .where(
      eq(
        workOrders.id,
        db
          .select({ id: workOrders.id })
          .from(workOrders)
          .where(and(eq(workOrders.siteId, siteId), eq(workOrders.status, "pending")))
          .orderBy(workOrders.issuedAt)
          .limit(1),
      ),
    )
    .returning();
  return row;
}

export async function markWorkOrderReverted(
  db: Database,
  workOrderId: string,
  result: Record<string, unknown>,
): Promise<WorkOrderRow | undefined> {
  const [row] = await db
    .update(workOrders)
    .set({ status: "reverted", result })
    .where(and(eq(workOrders.id, workOrderId), eq(workOrders.status, "executed")))
    .returning();
  return row;
}

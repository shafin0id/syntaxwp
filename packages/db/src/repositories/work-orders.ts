import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { signWorkOrder, type RiskLevel, type WorkOrder, type WorkOrderAction } from "@syntaxwp/shared";
import type { Database } from "../client.js";
import { workOrders } from "../schema/index.js";

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
    })
    .returning();

  return { row, wirePayload: { ...unsigned, hmac } };
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

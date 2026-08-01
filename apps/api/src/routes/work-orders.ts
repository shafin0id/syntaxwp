import { Hono } from "hono";
import { z } from "zod";
import {
  db,
  approveWorkOrder,
  declineWorkOrder,
  getWorkOrderById,
  getWorkOrderForOrg,
  insertAuditLog,
  markWorkOrderExecuted,
} from "@syntaxwp/db";
import { requireSession, getOrgIdFromUser, type SessionVariables } from "../auth/middleware.js";
import { verifySiteAuth, type SiteAuthVariables } from "../auth/site-auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { armDeadMansSwitch } from "../worker/tasks/dead-mans-switch.js";

// ActionExecutor's own result shape (packages/plugin/wp7/ActionExecutor.php)
// — always has `success`; every other field (action/target/reason) varies
// by which action ran, so passthrough rather than an exhaustive union.
const ExecutionResultSchema = z.object({ success: z.boolean() }).passthrough();
const ResultReportSchema = z.object({ result: ExecutionResultSchema });

// Dashboard-facing approval flow for a work order §9.3's policy engine put
// in "awaiting_approval" (A3.3's "ask" decision, wired at issuance by
// issueWorkOrderWithPolicy in packages/db). Session-authed, org-scoped —
// the same requireSession + getOrgIdFromUser pattern as A5a.2a's sites
// routes, since this is a dashboard user action, not a plugin one.
//
// :id/result is the exception — plugin-originated (site-HMAC authed, same
// as sites.ts's heartbeat/events), the execution-report round-trip A7.2
// completes (armDeadMansSwitch's own comment already called out this call
// site as "Task A5b adds" — it didn't get built until now, when the legacy
// polling path actually needed it end to end).
export const workOrdersRoutes = new Hono<{ Variables: SessionVariables & SiteAuthVariables }>()
  .post("/:id/approve", requireSession, async (c) => {
    const orgId = getOrgIdFromUser(c.get("user"));
    if (!orgId) {
      return c.json({ error: "user has no associated org" }, 403);
    }

    const owned = await getWorkOrderForOrg(db, c.req.param("id"), orgId);
    if (!owned) {
      return c.json({ error: "work order not found" }, 404);
    }

    const updated = await approveWorkOrder(db, owned.id);
    if (!updated) {
      return c.json({ error: "work order is not awaiting approval" }, 409);
    }

    await insertAuditLog(db, {
      siteId: updated.siteId,
      workOrderId: updated.id,
      incidentId: updated.incidentId,
      eventType: "work_order_approved",
      actor: `user:${c.get("user").id}`,
      summary: `Approved ${updated.action} (${updated.risk} risk)`,
    });

    return c.json({ ok: true, status: updated.status });
  })
  .post("/:id/decline", requireSession, async (c) => {
    const orgId = getOrgIdFromUser(c.get("user"));
    if (!orgId) {
      return c.json({ error: "user has no associated org" }, 403);
    }

    const owned = await getWorkOrderForOrg(db, c.req.param("id"), orgId);
    if (!owned) {
      return c.json({ error: "work order not found" }, 404);
    }

    const updated = await declineWorkOrder(db, owned.id);
    if (!updated) {
      return c.json({ error: "work order is not awaiting approval" }, 409);
    }

    await insertAuditLog(db, {
      siteId: updated.siteId,
      workOrderId: updated.id,
      incidentId: updated.incidentId,
      eventType: "work_order_declined",
      actor: `user:${c.get("user").id}`,
      summary: `Declined ${updated.action} (${updated.risk} risk)`,
    });

    return c.json({ ok: true, status: updated.status });
  })
  .post(
    "/:id/result",
    verifySiteAuth,
    rateLimit<{ Variables: SessionVariables & SiteAuthVariables }>("work_claims", (c) =>
      c.get("site").id,
    ),
    async (c) => {
      const site = c.get("site");
      const workOrder = await getWorkOrderById(db, c.req.param("id"));
      if (!workOrder || workOrder.siteId !== site.id) {
        return c.json({ error: "work order not found" }, 404);
      }

      const parsed = ResultReportSchema.safeParse(c.get("siteAuthPayload"));
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
      }

      const updated = await markWorkOrderExecuted(db, workOrder.id, parsed.data.result);
      if (!updated) {
        return c.json({ error: "work order is not claimed" }, 409);
      }

      await insertAuditLog(db, {
        siteId: updated.siteId,
        workOrderId: updated.id,
        incidentId: updated.incidentId,
        eventType: "work_order_executed",
        actor: "system",
        summary: `Executed ${updated.action} (${parsed.data.result.success ? "success" : "failure"})`,
        evidence: parsed.data.result,
      });

      // Only arm the switch when execution actually succeeded — a
      // not_implemented/plugin_not_found failure never changed anything on
      // the site, so there's nothing to revert if no disarm ever comes.
      if (parsed.data.result.success) {
        await armDeadMansSwitch(updated.id, updated.deadMansSwitchMs);
      }

      return c.json({ ok: true, status: updated.status });
    },
  );

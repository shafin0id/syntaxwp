import { Hono } from "hono";
import { db, approveWorkOrder, declineWorkOrder, getWorkOrderForOrg, insertAuditLog } from "@syntaxwp/db";
import { requireSession, getOrgIdFromUser, type SessionVariables } from "../auth/middleware.js";

// Dashboard-facing approval flow for a work order §9.3's policy engine put
// in "awaiting_approval" (A3.3's "ask" decision, wired at issuance by
// issueWorkOrderWithPolicy in packages/db). Session-authed, org-scoped —
// the same requireSession + getOrgIdFromUser pattern as A5a.2a's sites
// routes, since this is a dashboard user action, not a plugin one.
export const workOrdersRoutes = new Hono<{ Variables: SessionVariables }>()
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
  });

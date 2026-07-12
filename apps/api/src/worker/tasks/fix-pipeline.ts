import type { Task } from "graphile-worker";
import { db } from "@syntaxwp/db";
import { incidents, auditLog, pluginInventory, sites } from "@syntaxwp/db";
import { eq, and } from "drizzle-orm";
import { binarySearchPluginConflict, verifyStagingVisualRegression, executeMcpActionOnSite } from "./diagnostics.js";
import { verifyPageHealth } from "./verify-page-health.js";
import { routeLLMTask } from "../../router/router.js";
import { FixIntentSchema } from "@syntaxwp/shared";

export const fixPipeline: Task = async (payload: any) => {
  const { incidentId } = payload as { incidentId: string };
  console.log(`[Fix Pipeline] Running pipeline for incident: ${incidentId}`);

  // Fetch incident
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
  if (!incident) {
    console.error(`Incident ${incidentId} not found.`);
    return;
  }

  // Concurrency guard - skip if already in progress or completed
  if (["resolved", "escalated", "diagnosing", "fixing", "testing"].includes(incident.status)) {
    console.log(`[Fix Pipeline] Incident ${incidentId} has status "${incident.status}", skipping.`);
    return;
  }

  // Fetch site info
  const [site] = await db.select().from(sites).where(eq(sites.id, incident.siteId)).limit(1);
  if (!site) {
    console.error(`Site ${incident.siteId} not found for incident ${incidentId}`);
    return;
  }

  // 1. open -> diagnosing
  console.log(`[Fix Pipeline] Transitioning open -> diagnosing`);
  await db.update(incidents).set({ status: "diagnosing" }).where(eq(incidents.id, incident.id));
  
  await db.insert(auditLog).values({
    siteId: incident.siteId,
    incidentId: incident.id,
    eventType: "state_transition",
    actor: "system",
    summary: "Started automated diagnostics on incident.",
  });

  // Get active plugins list
  const plugins = await db
    .select({ slug: pluginInventory.slug })
    .from(pluginInventory)
    .where(and(eq(pluginInventory.siteId, incident.siteId), eq(pluginInventory.active, true)))
    .limit(100); // safety cap

  const pluginSlugs = plugins.map((p) => p.slug).filter(Boolean) as string[];

  let isolatedPlugin: string | null = null;
  if (pluginSlugs.length > 0) {
    const targetDiagUrl = site.stagingUrl || site.url;
    if (!site.stagingUrl) {
      await db.insert(auditLog).values({
        siteId: incident.siteId,
        incidentId: incident.id,
        eventType: "state_transition",
        actor: "system",
        summary: "WARNING: Staging URL not configured. Running diagnostics and binary search against the live production site.",
      });
    }
    isolatedPlugin = await binarySearchPluginConflict(pluginSlugs, incident.siteId, targetDiagUrl);
  }

  // 2. diagnosing -> fixing
  console.log(`[Fix Pipeline] Transitioning diagnosing -> fixing`);
  await db.update(incidents).set({ status: "fixing", rootCause: isolatedPlugin || "unknown" }).where(eq(incidents.id, incident.id));

  await db.insert(auditLog).values({
    siteId: incident.siteId,
    incidentId: incident.id,
    eventType: "diagnostic_complete",
    actor: "system",
    summary: isolatedPlugin 
      ? `Isolated plugin conflict to: ${isolatedPlugin}.`
      : "Completed diagnostics, no specific plugin isolated.",
    evidence: { suspect_plugins: isolatedPlugin ? [isolatedPlugin] : [] },
  });

  // Call cognitive router
  let fixIntent;
  try {
    fixIntent = await routeLLMTask({
      task: "fix",
      severity: incident.severity as any,
      input: {
        error: incident.plainEnglish,
        culprit: isolatedPlugin,
      },
      schema: FixIntentSchema,
    });
  } catch (err: any) {
    console.error("LLM Fix generation failed:", err.message);
    await db.update(incidents).set({ status: "escalated" }).where(eq(incidents.id, incident.id));
    await db.insert(auditLog).values({
      siteId: incident.siteId,
      incidentId: incident.id,
      eventType: "state_transition",
      actor: "system",
      summary: `LLM fix generation failed: ${err.message}. Escalating incident.`,
    });
    return;
  }

  // 3. fixing -> testing
  console.log(`[Fix Pipeline] Transitioning fixing -> testing`);
  await db.update(incidents).set({ status: "testing" }).where(eq(incidents.id, incident.id));

  // Never test a made-up localhost URL. Without staging, production health
  // verification after the action is the only meaningful signal.
  if (site.stagingUrl && !(await verifyStagingVisualRegression(incident.siteId, site.stagingUrl))) {
    console.warn(`[Fix Pipeline] Visual regression failed on staging! Escalating.`);
    await db.update(incidents).set({ status: "escalated" }).where(eq(incidents.id, incident.id));
    await db.insert(auditLog).values({
      siteId: incident.siteId,
      incidentId: incident.id,
      eventType: "staging_check_failed",
      actor: "system",
      summary: "Staging checks failed (visual layout mismatch or script crash). Escalated to owner.",
    });
    return;
  }

  // Apply fix in production DB only if permitted by settings
  const isAllowed =
    site.permissionTier === "full_auto" ||
    payload.manualApproval === true ||
    ((site.permissionTier === "some_access" || site.permissionTier === "custom") && 
     (site.allowedActions as string[] || []).includes(fixIntent.action));

  if (!isAllowed) {
    console.log(`[Fix Pipeline] Fix action "${fixIntent.action}" is not approved automatically. Escalating for manual confirmation.`);
    await db.update(incidents).set({ status: "escalated" }).where(eq(incidents.id, incident.id));
    await db.insert(auditLog).values({
      siteId: incident.siteId,
      incidentId: incident.id,
      eventType: "state_transition",
      actor: "system",
      summary: `Fix action "${fixIntent.action}" on "${fixIntent.target || "site"}" requires manual approval under current settings. Escalated.`,
    });
    return;
  }

  if (fixIntent.action !== "deactivate_plugin" || !fixIntent.target) {
    await db.update(incidents).set({ status: "escalated" }).where(eq(incidents.id, incident.id));
    await db.insert(auditLog).values({
      siteId: incident.siteId,
      incidentId: incident.id,
      eventType: "state_transition",
      actor: "system",
      summary: `Cannot safely execute unsupported fix action: ${fixIntent.action}. Escalated.`,
    });
    return;
  }

  const actionSucceeded = await executeMcpActionOnSite(
    incident.siteId,
    "deactivate_plugin",
    fixIntent.target,
  );
  if (!actionSucceeded) {
    await db.update(incidents).set({ status: "escalated" }).where(eq(incidents.id, incident.id));
    await db.insert(auditLog).values({
      siteId: incident.siteId,
      incidentId: incident.id,
      eventType: "state_transition",
      actor: "system",
      summary: `Site rejected or did not complete deactivation of ${fixIntent.target}. Escalated.`,
    });
    return;
  }

  // Inventory mirrors confirmed site state only; it is not an execution API.
  await db
    .update(pluginInventory)
    .set({ active: false })
    .where(and(eq(pluginInventory.siteId, incident.siteId), eq(pluginInventory.slug, fixIntent.target)));

  // Perform final production health check
  console.log(`[Fix Pipeline] Verifying production health after applying fix...`);
  const productionHealthy = await verifyPageHealth(incident.siteId, site.url);

  if (!productionHealthy) {
    console.warn(`[Fix Pipeline] Production health check failed after applying fix! Escalating.`);
    
    // Rollback DB deactivation if we applied it, for safety
    if (fixIntent.action === "deactivate_plugin" && fixIntent.target) {
      const restored = await executeMcpActionOnSite(incident.siteId, "activate_plugin", fixIntent.target);
      if (restored) {
        await db
          .update(pluginInventory)
          .set({ active: true })
          .where(
            and(
              eq(pluginInventory.siteId, incident.siteId),
              eq(pluginInventory.slug, fixIntent.target)
            )
          );
      }
    }

    await db.update(incidents).set({ status: "escalated" }).where(eq(incidents.id, incident.id));
    await db.insert(auditLog).values({
      siteId: incident.siteId,
      incidentId: incident.id,
      eventType: "state_transition",
      actor: "system",
      summary: "Production health check failed post-fix. Rolled back changes and escalated to owner.",
    });
    return;
  }

  // 4. testing -> resolved (promote)
  console.log(`[Fix Pipeline] Transitioning testing -> resolved`);
  
  await db
    .update(incidents)
    .set({
      status: "resolved",
      resolvedAt: new Date(),
    })
    .where(eq(incidents.id, incident.id));

  let auditSummary = `Successfully resolved incident.`;
  if (fixIntent.action === "deactivate_plugin" && fixIntent.target) {
    auditSummary = `Successfully deactivated plugin ${fixIntent.target} and restored site health.`;
  } else {
    auditSummary = `Successfully applied fix action: ${fixIntent.action} on ${fixIntent.target || "site"} and restored health.`;
  }

  await db.insert(auditLog).values({
    siteId: incident.siteId,
    incidentId: incident.id,
    eventType: "fix_applied",
    actor: "system",
    summary: auditSummary,
    evidence: { fix_intent: fixIntent },
  });

  console.log(`[Fix Pipeline] Incident ${incidentId} resolved successfully.`);
};

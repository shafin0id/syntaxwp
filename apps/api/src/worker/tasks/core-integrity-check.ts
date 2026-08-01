import type { Task } from "graphile-worker";
import { db, sites, incidents, securityActionsLog } from "@syntaxwp/db";
import { eq } from "drizzle-orm";
import { callMcpAbility } from "./diagnostics.js";

// §8/§12.1-12.2 core-file checksum audit. Only wp7_native sites are covered
// today — the check runs over the MCP ability channel, which the legacy
// outbound-polling plugin path doesn't expose (it would need its own signed
// work order + WorkOrderPoller wiring, not built yet).
export const coreIntegrityCheck: Task = async () => {
  const nativeSites = await db.select().from(sites).where(eq(sites.executionPath, "wp7_native"));

  for (const site of nativeSites) {
    const result = await callMcpAbility(site.id, "verify_core_integrity");

    if (!result) {
      console.warn(`[core-integrity] ${site.url}: unreachable or ability call failed.`);
      continue;
    }

    if (!result.success) {
      await db.insert(securityActionsLog).values({
        siteId: site.id,
        actionType: "FILE_AUTO_REPAIR",
        target: "core",
        status: "FAILED",
        details: `Checksum fetch failed: ${result.reason ?? "unknown"}`,
      });
      continue;
    }

    const modified: string[] = result.modified ?? [];
    const missing: string[] = result.missing ?? [];
    const repairFailed: string[] = result.repair_failed ?? [];

    if (modified.length === 0 && missing.length === 0) {
      continue; // clean scan, nothing to log
    }

    await db.insert(securityActionsLog).values({
      siteId: site.id,
      actionType: "FILE_AUTO_REPAIR",
      target: "core",
      status: repairFailed.length > 0 ? "FAILED" : "SUCCESS",
      details: `wp_version=${result.wp_version}, modified=${modified.length}, missing=${missing.length}, repair_failed=${repairFailed.length}`,
    });

    if (repairFailed.length > 0) {
      const fingerprint = `${site.id}_integrity_breach`;
      const [newIncident] = await db
        .insert(incidents)
        .values({
          siteId: site.id,
          fingerprint,
          type: "integrity_breach",
          severity: "high",
          status: "open",
          class: "security",
          rootCause: "Core file integrity check could not restore a tampered/missing file",
          plainEnglish: `${repairFailed.length} WordPress core file(s) don't match the official checksum and couldn't be auto-repaired: ${repairFailed.join(", ")}`,
          confidence: 0.95,
        })
        .onConflictDoNothing()
        .returning();

      if (!newIncident) {
        const [existing] = await db.select().from(incidents).where(eq(incidents.fingerprint, fingerprint)).limit(1);
        if (existing?.status === "resolved") {
          await db.update(incidents).set({ status: "open", resolvedAt: null, detectedAt: new Date() }).where(eq(incidents.id, existing.id));
        }
      }
    } else {
      // Everything that was off got auto-repaired — close any prior breach.
      await db
        .update(incidents)
        .set({ status: "resolved", resolvedAt: new Date() })
        .where(eq(incidents.fingerprint, `${site.id}_integrity_breach`));
    }

    console.log(`[core-integrity] ${site.url}: modified=${modified.length} missing=${missing.length} repair_failed=${repairFailed.length}`);
  }
};

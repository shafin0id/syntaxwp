import type { Task } from "graphile-worker";
import { db } from "@syntaxwp/db";
import { sites, incidents } from "@syntaxwp/db";
import { and, eq, isNotNull } from "drizzle-orm";

const DRIFT_THRESHOLD_MS = 180 * 1000; // §5.1 Source 4 — gap over 180s = server-level outage alarm

export const heartbeatDriftCheck: Task = async () => {
  const allSites = await db.select().from(sites).where(isNotNull(sites.lastHeartbeatAt));
  const now = Date.now();

  for (const site of allSites) {
    const lastHeartbeatAt = site.lastHeartbeatAt as Date;
    const driftMs = now - lastHeartbeatAt.getTime();

    const [openIncident] = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.siteId, site.id), eq(incidents.type, "heartbeat_drift"), eq(incidents.status, "open")))
      .limit(1);

    if (driftMs > DRIFT_THRESHOLD_MS) {
      if (openIncident) continue; // already alarmed, don't spam

      await db
        .insert(incidents)
        .values({
          siteId: site.id,
          fingerprint: `${site.id}_heartbeat_drift`,
          type: "heartbeat_drift",
          severity: "high",
          status: "open",
          class: "server",
          rootCause: "No heartbeat received",
          plainEnglish: `No heartbeat received for ${Math.floor(driftMs / 1000)}s — the site may be down at the server level (not just a PHP error).`,
          confidence: 0.9,
        })
        .onConflictDoNothing();

      console.log(`[heartbeat-drift] ${site.url}: drift ${Math.floor(driftMs / 1000)}s, incident raised.`);
    } else if (openIncident) {
      // Heartbeat resumed — close out the outage alarm.
      await db
        .update(incidents)
        .set({ status: "resolved", resolvedAt: new Date() })
        .where(eq(incidents.id, openIncident.id));

      console.log(`[heartbeat-drift] ${site.url}: heartbeat resumed, incident ${openIncident.id} auto-resolved.`);
    }
  }
};

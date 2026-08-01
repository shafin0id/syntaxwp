import type { Task } from "graphile-worker";
import { db } from "@syntaxwp/db";
import { performanceSnapshots, incidents, auditLog, sites } from "@syntaxwp/db";
import { eq, and, gte, lt, desc, avg, asc } from "drizzle-orm";
import { executeMcpActionOnSite } from "./diagnostics.js";

// ── helpers ────────────────────────────────────────────────────────────────

async function measureTTFB(url: string): Promise<number | null> {
  try {
    const start = Date.now();
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
    const elapsed = Date.now() - start;
    if (!res.ok && res.status >= 500) return null;
    return elapsed;
  } catch {
    return null;
  }
}

async function getSyntheticBaseline(siteId: string): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [result] = await db
    .select({ avgTtfb: avg(performanceSnapshots.ttfbMs) })
    .from(performanceSnapshots)
    .where(
      and(
        eq(performanceSnapshots.siteId, siteId),
        eq(performanceSnapshots.formFactor, "synthetic"),
        gte(performanceSnapshots.collectedAt, thirtyDaysAgo),
        lt(performanceSnapshots.collectedAt, oneHourAgo)
      )
    );
  return result?.avgTtfb ? Number(result.avgTtfb) : 400; // default 400ms baseline
}

async function getTrailingConsecutive(siteId: string, baseline: number): Promise<number> {
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000 * 4); // last 4 windows
  const rows = await db
    .select({ ttfbMs: performanceSnapshots.ttfbMs, collectedAt: performanceSnapshots.collectedAt })
    .from(performanceSnapshots)
    .where(
      and(
        eq(performanceSnapshots.siteId, siteId),
        eq(performanceSnapshots.formFactor, "synthetic"),
        gte(performanceSnapshots.collectedAt, fifteenMinsAgo)
      )
    )
    .orderBy(desc(performanceSnapshots.collectedAt))
    .limit(3);

  if (rows.length < 3) return 0;

  let consecutive = 0;
  for (const row of rows) {
    if ((row.ttfbMs ?? 0) > baseline * 1.5) consecutive++;
    else break;
  }
  return consecutive;
}

async function logAuditEvent(siteId: string, summary: string, evidence: Record<string, any>) {
  await db.insert(auditLog).values({
    siteId,
    eventType: "perf_auto_remediation",
    actor: "system",
    summary,
    evidence,
  });
  console.log(`[perf-ping] AUDIT: ${summary}`);
}

async function warmCaches(siteUrl: string) {
  const paths = ["/", "/shop/", "/blog/"];
  for (const path of paths) {
    fetch(`${siteUrl}${path}`, { signal: AbortSignal.timeout(10000) }).catch(() => {});
  }
  console.log(`[perf-ping] Cache warm-up fired for ${siteUrl} → /, /shop/, /blog/`);
}

async function runRemediation(site: { id: string; url: string }, baseline: number): Promise<void> {
  console.log(`[perf-ping] 🛡 Remediation started for ${site.url}`);

  // ── Step 1: Cache Flush ────────────────────────────────────────────────
  const flushOk = await executeMcpActionOnSite(site.id, "flush_cache");
  const ttfbAfterFlush = await measureTTFB(site.url);

  if (flushOk && ttfbAfterFlush !== null && ttfbAfterFlush < baseline * 1.5) {
    await logAuditEvent(site.id, "Resolved via Cache Flush", {
      step: 1, ttfbAfterFlush, baseline, action: "flush_cache",
    });
    await warmCaches(site.url);
    return;
  }

  console.log(`[perf-ping] Cache flush insufficient. TTFB still ${ttfbAfterFlush}ms vs baseline ${baseline}ms`);

  // ── Step 2: Autoload Memory Audit ────────────────────────────────────────
  const auditResult = await executeMcpActionOnSite(site.id, "autoload_audit");
  if (auditResult) {
    await logAuditEvent(site.id, "Autoload audit executed — transients cleaned if over 1.5MB", {
      step: 2, action: "autoload_audit", ttfbAfterFlush, baseline,
    });
  }

  // ── Step 3: Cache Warm-Up ──────────────────────────────────────────────
  await warmCaches(site.url);
  await logAuditEvent(site.id, "Cache warm-up fired after remediation", {
    step: 3, paths: ["/", "/shop/", "/blog/"],
  });
}

// ── Main Task ──────────────────────────────────────────────────────────────

export const performancePing: Task = async () => {
  console.log("[perf-ping] Starting 15-min synthetic TTFB sweep...");
  const allSites = await db.select().from(sites);

  for (const site of allSites) {
    try {
      const ttfb = await measureTTFB(site.url);
      if (ttfb === null) {
        console.warn(`[perf-ping] ${site.url} unreachable, skipping.`);
        continue;
      }

      // Store synthetic snapshot
      await db.insert(performanceSnapshots).values({
        siteId: site.id,
        ttfbMs: ttfb,
        formFactor: "synthetic",
      });

      const baseline = await getSyntheticBaseline(site.id);
      const ratio = ttfb / baseline;

      console.log(`[perf-ping] ${site.url} TTFB=${ttfb}ms | baseline=${baseline.toFixed(0)}ms | ratio=${ratio.toFixed(2)}`);

      // ── Emergency Override: single ping > 3× baseline ──────────────────
      if (ratio > 3.0) {
        const fingerprint = `${site.id}_perf_emergency_${Math.floor(Date.now() / (900 * 1000))}`;
        await db.insert(incidents).values({
          siteId: site.id,
          fingerprint,
          type: "perf_regression",
          severity: "high",
          status: "open",
          class: "performance",
          rootCause: "Emergency TTFB spike",
          plainEnglish: `TTFB spiked to ${ttfb}ms — ${ratio.toFixed(1)}× baseline (${baseline.toFixed(0)}ms). Instant trigger.`,
          confidence: 0.99,
        }).onConflictDoNothing();

        await logAuditEvent(site.id, `Emergency TTFB spike: ${ttfb}ms (${ratio.toFixed(1)}× baseline)`, { ttfb, baseline, ratio });
        await runRemediation(site, baseline);
        continue;
      }

      // ── State Machine: 3 consecutive >1.5× windows ────────────────────
      const consecutiveCount = await getTrailingConsecutive(site.id, baseline);
      if (consecutiveCount >= 3) {
        const fingerprint = `${site.id}_perf_regression_${Math.floor(Date.now() / (3600 * 1000))}`;
        await db.insert(incidents).values({
          siteId: site.id,
          fingerprint,
          type: "perf_regression",
          severity: "low",
          status: "open",
          class: "performance",
          rootCause: "TTFB Regression",
          plainEnglish: `Response time degraded for 3 consecutive checks. Current TTFB ${ttfb}ms vs baseline ${baseline.toFixed(0)}ms.`,
          confidence: 0.95,
        }).onConflictDoNothing();

        await logAuditEvent(site.id, `Consecutive TTFB regression confirmed (${consecutiveCount}/3)`, { ttfb, baseline, consecutiveCount });
        await runRemediation(site, baseline);
      }
    } catch (err: any) {
      console.error(`[perf-ping] ${site.url} error: ${err.message}`);
    }
  }

  console.log("[perf-ping] Synthetic sweep complete.");
};

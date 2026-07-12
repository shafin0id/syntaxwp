export interface SiteHealthMetrics {
  uptime7d?: number;
  criticalVulns?: number;
  highVulns?: number;
  pendingCoreUpdate?: boolean;
  pendingPluginUpdates?: number;
  sslDaysRemaining?: number;
  autoloadSizeKb?: number;
  openIncidents?: number;
  lastBackupHours?: number;
  ttfbMs?: number;
  unpatchedCriticalVulns?: boolean;
  activeCoreIntegrityBreach?: boolean;
}

export function calculateHealthScore(metrics: SiteHealthMetrics): { score: number; status_severity?: string } {
  if (metrics.unpatchedCriticalVulns || metrics.activeCoreIntegrityBreach) {
    return { score: 0, status_severity: "EMERGENCY_LOCKDOWN" };
  }

  let score = 100;

  const uptime = metrics.uptime7d ?? 100;
  if (uptime < 99.9) score -= 15;
  if (uptime < 99.0) score -= 25; // cumulative, total -40 if <99.0

  // Removed flat -20 deductions for critical threats, handled by unpatchedCriticalVulns check above

  const high = metrics.highVulns ?? 0;
  if (high > 0) score -= 5 * Math.min(high, 4);

  if (metrics.pendingCoreUpdate) score -= 10;

  const pluginUpdates = metrics.pendingPluginUpdates ?? 0;
  if (pluginUpdates > 5) score -= 10;

  const sslDays = metrics.sslDaysRemaining ?? 999;
  if (sslDays < 14) score -= 15;
  if (sslDays < 3) score -= 30; // cumulative, total -45 if <3

  const autoload = metrics.autoloadSizeKb ?? 0;
  if (autoload > 1000) score -= 5;

  const incidents = metrics.openIncidents ?? 0;
  if (incidents > 0) score -= 10 * incidents;

  // Unknown backup age defaults to Infinity (worst case)
  const backupHours = metrics.lastBackupHours ?? Infinity;
  if (backupHours > 24) score -= 10;
  if (backupHours > 72) score -= 20; // cumulative, total -30 if >72

  // Deduct points for bad TTFB
  if (metrics.ttfbMs && metrics.ttfbMs > 600) {
    score -= 10;
  }

  return { score: Math.max(0, Math.min(100, score)) };
}

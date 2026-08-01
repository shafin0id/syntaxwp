import { describe, it, expect } from "vitest";
import { calculateHealthScore } from "./health-score.js";

describe("calculateHealthScore", () => {
  it("should return 100 for perfect health metrics", () => {
    const result = calculateHealthScore({
      uptime7d: 100,
      criticalVulns: 0,
      highVulns: 0,
      pendingCoreUpdate: false,
      pendingPluginUpdates: 0,
      sslDaysRemaining: 90,
      autoloadSizeKb: 200,
      openIncidents: 0,
      lastBackupHours: 4,
    });
    expect(result.score).toBe(100);
  });

  it("should apply deductions correctly", () => {
    // 1. Uptime < 99.9 -> -15
    // 2. Pending core update -> -10
    // 3. SSL days < 14 -> -15
    // 4. Open incidents (1) -> -10
    // Total deductions = 50. Health score = 50.
    const result = calculateHealthScore({
      uptime7d: 99.5,
      criticalVulns: 0,
      highVulns: 0,
      pendingCoreUpdate: true,
      pendingPluginUpdates: 2,
      sslDaysRemaining: 10,
      autoloadSizeKb: 100,
      openIncidents: 1,
      lastBackupHours: 12,
    });
    expect(result.score).toBe(50);
  });

  it("should handle cumulative deductions for extreme cases", () => {
    // 1. Uptime < 99.0 -> -15 (for <99.9) and -25 (for <99.0) = -40
    // 2. SSL days < 3 -> -15 (for <14) and -30 (for <3) = -45
    // 3. Backup > 72 hours -> -10 (for >24) and -20 (for >72) = -30
    // Total deductions = 115. Score should be capped at 0.
    const result = calculateHealthScore({
      uptime7d: 98.5,
      criticalVulns: 0,
      highVulns: 0,
      pendingCoreUpdate: false,
      pendingPluginUpdates: 0,
      sslDaysRemaining: 2,
      autoloadSizeKb: 100,
      openIncidents: 0,
      lastBackupHours: 80,
    });
    expect(result.score).toBe(0);
  });

  it("should not penalize multiple critical vulnerabilities via flat deductions", () => {
    // Flat deductions are removed, so score should be 100 if unpatchedCriticalVulns is not set
    const result = calculateHealthScore({
      uptime7d: 100,
      criticalVulns: 2,
      highVulns: 0,
      pendingCoreUpdate: false,
      pendingPluginUpdates: 0,
      sslDaysRemaining: 90,
      autoloadSizeKb: 200,
      openIncidents: 0,
      lastBackupHours: 4,
    });
    expect(result.score).toBe(100);
  });

  it("should short-circuit to 0 with EMERGENCY_LOCKDOWN if unpatched critical vulnerability or core integrity breach is set", () => {
    const result1 = calculateHealthScore({
      unpatchedCriticalVulns: true,
    });
    expect(result1.score).toBe(0);
    expect(result1.status_severity).toBe("EMERGENCY_LOCKDOWN");

    const result2 = calculateHealthScore({
      activeCoreIntegrityBreach: true,
    });
    expect(result2.score).toBe(0);
    expect(result2.status_severity).toBe("EMERGENCY_LOCKDOWN");
  });

  it("should cap high vulnerabilities deduction at 4 plugins", () => {
    // 6 high vulnerabilities -> -5 * min(6, 4) = -20
    // Total score = 80
    const result = calculateHealthScore({
      uptime7d: 100,
      criticalVulns: 0,
      highVulns: 6,
      pendingCoreUpdate: false,
      pendingPluginUpdates: 0,
      sslDaysRemaining: 90,
      autoloadSizeKb: 200,
      openIncidents: 0,
      lastBackupHours: 4,
    });
    expect(result.score).toBe(80);
  });
});

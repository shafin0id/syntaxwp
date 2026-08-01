import { describe, it, expect } from "vitest";
import { estimateRevenueLoss } from "./revenue-loss.js";

describe("estimateRevenueLoss", () => {
  it("should calculate off-peak loss correctly", () => {
    // 3 PM (off-peak, multiplier = 1.0)
    // Hourly baseline = 100
    // Duration = 60 minutes
    // Expected loss = 100
    const detectedAt = new Date("2026-07-07T15:00:00");
    const loss = estimateRevenueLoss(100, 60, detectedAt);
    expect(loss).toBe(100);
  });

  it("should calculate peak loss with 1.8x multiplier correctly", () => {
    // 8 PM (peak hour, multiplier = 1.8)
    // Hourly baseline = 100
    // Duration = 30 minutes
    // Expected loss = (30/60) * 100 * 1.8 = 90
    const detectedAt = new Date("2026-07-07T20:00:00");
    const loss = estimateRevenueLoss(100, 30, detectedAt);
    expect(loss).toBe(90);
  });

  it("should return correct fractions", () => {
    const detectedAt = new Date("2026-07-07T10:00:00");
    const loss = estimateRevenueLoss(79, 15, detectedAt);
    // (15/60) * 79 * 1.0 = 19.75
    expect(loss).toBe(19.75);
  });
});

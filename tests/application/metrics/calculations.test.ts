import { describe, expect, it } from "vitest";

import {
  approvedThresholdResult,
  dateWithinRange,
  decimalRateToBasisPoints,
  safeRateBasisPoints,
  sumFiniteNumbers,
  sumSafeNumbers,
  usdFromDecimalNumber,
} from "@/src/domain/metrics/calculations";

describe("B5 deterministic calculations", () => {
  it("handles normal, zero, negative adjustment, and zero-denominator values", () => {
    expect(sumSafeNumbers([10, 5, -3])).toBe(12);
    expect(sumFiniteNumbers([1.5, 2.25, -0.25])).toBe(3.5);
    expect(usdFromDecimalNumber(-12.34).minorUnits).toBe(-1234);
    expect(safeRateBasisPoints(5, 20)).toBe(2500);
    expect(safeRateBasisPoints(0, 0)).toBeNull();
    expect(safeRateBasisPoints(null, 10)).toBeNull();
  });

  it("requires explicit provider rate units", () => {
    expect(decimalRateToBasisPoints(0.125)).toBe(1250);
    expect(() => decimalRateToBasisPoints(12.5)).toThrow(/between zero and one/);
    expect(() => usdFromDecimalNumber(1.234)).toThrow(/smaller than one cent/);
  });

  it("uses inclusive calendar-date filtering and no machine-timezone conversion", () => {
    const range = { startDate: "2026-07-01", endDate: "2026-07-31" } as const;
    expect(dateWithinRange("2026-07-01", range)).toBe(true);
    expect(dateWithinRange("2026-07-31", range)).toBe(true);
    expect(dateWithinRange("2026-06-30", range)).toBe(false);
  });

  it("never evaluates an alert without both a value and approved threshold", () => {
    expect(approvedThresholdResult({ actual: 8, threshold: null, direction: "below" })).toBe(
      "business_rule_required",
    );
    expect(approvedThresholdResult({ actual: null, threshold: 10, direction: "below" })).toBe(
      "data_source_not_ready",
    );
    expect(approvedThresholdResult({ actual: 8, threshold: 10, direction: "below" })).toBe(
      "triggered",
    );
  });
});

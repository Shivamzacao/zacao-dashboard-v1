import { describe, expect, it } from "vitest";

import {
  formatChartValue,
  formatCount,
  formatDate,
  formatDateTime,
  formatDisplayValue,
  formatMonth,
  formatPercent,
  formatQuantity,
  formatUsd,
  fullDisplayValue,
} from "@/src/presentation/components/dashboard/format-display-value";

describe("dashboard display formatting", () => {
  it("uses compact notation only at the visible-value threshold", () => {
    expect(formatCount(999, "compact")).toBe("999");
    expect(formatCount(1_000, "compact")).toBe("1K");
    expect(formatCount(1_250, "compact")).toBe("1.3K");
    expect(formatCount(-1_250, "compact")).toBe("-1.3K");
    expect(formatCount(1_250, "full")).toBe("1,250");
  });

  it("formats USD compactly for KPIs and fully for disclosure surfaces", () => {
    expect(formatUsd(999, "compact")).toBe("$999.00");
    expect(formatUsd(1_000, "compact")).toBe("$1K");
    expect(formatUsd(-1_250.5, "full")).toBe("-$1,250.50");

    const value = {
      kind: "money" as const,
      value: { currency: "USD" as const, minorUnits: 98_765_432_100 },
    };
    expect(formatDisplayValue(value)).toBe("$987.7M");
    expect(fullDisplayValue(value)).toBe("$987,654,321.00");
  });

  it("keeps count, quantity, percent, duration, zero, and unavailable semantics distinct", () => {
    expect(formatCount(12.75)).toBe("13");
    expect(formatQuantity(12.75)).toBe("12.75");
    expect(formatPercent(2.64)).toBe("2.64%");
    expect(formatPercent(12.345, true)).toBe("+12.35%");
    expect(formatPercent(0, true)).toBe("0%");
    expect(formatDisplayValue({ kind: "duration_seconds", value: 65 }, "full")).toBe("1m 5s");
    expect(formatDisplayValue({ kind: "count", value: 0 })).toBe("0");
    expect(formatDisplayValue(null)).toBe("Unavailable");
    expect(fullDisplayValue(null)).toBe("Data unavailable");
  });

  it("uses full values for tooltips and compact values for chart axes", () => {
    expect(formatChartValue(12_500, "money", "compact")).toBe("$12.5K");
    expect(formatChartValue(12_500, "money", "full")).toBe("$12,500.00");
    expect(formatChartValue(6_210, "count", "compact")).toBe("6.2K");
    expect(formatChartValue(6_210, "count", "full")).toBe("6,210");
    expect(formatChartValue(4.25, "quantity", "full")).toBe("4.25");
  });

  it("uses the approved reporting locale and New York timezone for dates", () => {
    expect(formatDate("2026-07-31")).toBe("Jul 31, 2026");
    expect(formatMonth("2026-07")).toBe("Jul 2026");
    expect(formatDateTime("2026-08-07T14:00:00Z")).toBe("Aug 7, 2026, 10:00 AM");
  });
});

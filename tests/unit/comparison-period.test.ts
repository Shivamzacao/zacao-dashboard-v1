import { describe, expect, it } from "vitest";

import { comparisonDateRange } from "@/src/domain/utilities/comparison-period";

describe("comparisonDateRange", () => {
  it("returns null for no comparison", () => {
    expect(comparisonDateRange({ startDate: "2026-07-01", endDate: "2026-07-31" }, "none")).toBe(
      null,
    );
  });

  it("shifts back by the exact span of the selected range for previous_period", () => {
    expect(
      comparisonDateRange({ startDate: "2026-07-01", endDate: "2026-07-31" }, "previous_period"),
    ).toEqual({ startDate: "2026-05-31", endDate: "2026-06-30" });
  });

  it("shifts a single day back by one day for previous_period", () => {
    expect(
      comparisonDateRange({ startDate: "2026-08-09", endDate: "2026-08-09" }, "previous_period"),
    ).toEqual({ startDate: "2026-08-08", endDate: "2026-08-08" });
  });

  it("shifts the same calendar dates back one year for previous_year", () => {
    expect(
      comparisonDateRange({ startDate: "2026-08-01", endDate: "2026-08-09" }, "previous_year"),
    ).toEqual({ startDate: "2025-08-01", endDate: "2025-08-09" });
  });

  it("normalizes a leap-day start date for previous_year", () => {
    expect(
      comparisonDateRange({ startDate: "2024-02-29", endDate: "2024-03-01" }, "previous_year"),
    ).toEqual({ startDate: "2023-03-01", endDate: "2023-03-01" });
  });
});

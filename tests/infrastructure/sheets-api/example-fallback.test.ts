import { describe, expect, it } from "vitest";

import type { SheetsTabReadResult } from "@/src/application/ports/sheets-tabs";
import {
  selectExampleFallback,
  syntheticSourceStatus,
} from "@/src/infrastructure/sheets-api/example-fallback";

const result: SheetsTabReadResult = {
  tabs: { Sales_Actuals: [{ order_id: "PROD-1" }] },
  exampleTabs: { Sales_Actuals: [{ order_id: "DEMO-1" }] },
  sourceStatus: {
    source: "google_sheets",
    state: "current",
    checkedAt: "2026-08-12T12:00:00.000Z",
    lastSuccessfulAt: "2026-08-12T12:00:00.000Z",
    dataAsOf: "2026-08-12T00:00:00.000Z",
    completeness: "complete",
    warningCodes: [],
  },
  warnings: [],
};

describe("Sheet example fallback", () => {
  it("always prefers usable production rows", () => {
    expect(selectExampleFallback(result, "Sales_Actuals")).toEqual({
      rows: [{ order_id: "PROD-1" }],
      usedExample: false,
    });
  });

  it("uses examples only after the metric-specific production check fails", () => {
    const selection = selectExampleFallback(result, "Sales_Actuals", () => false);
    expect(selection).toEqual({ rows: [{ order_id: "DEMO-1" }], usedExample: true });
    expect(syntheticSourceStatus(result.sourceStatus, selection.usedExample)).toMatchObject({
      state: "partial",
      completeness: "partial",
      warningCodes: ["SYNTHETIC_EXAMPLE_DATA"],
    });
  });
});

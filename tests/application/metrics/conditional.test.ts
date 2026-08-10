import { describe, expect, it } from "vitest";

import {
  buildBudgetActualBreakdown,
  buildCashPositionMetric,
  buildCombinedInventoryBreakdown,
  buildForecastVarianceTable,
  buildIncomingProductionTable,
  buildInventoryLotsTable,
} from "@/src/application/metrics";

import { context, source } from "./fixtures";

describe("B5 conditional calculation interfaces", () => {
  it("requires complete warehouse/account coverage before combined totals become values", () => {
    const inventoryFacts = [
      { asOfDate: "2026-07-31", warehouse: "SNAPL", sku: "SKU-A", quantity: 10.5 },
      { asOfDate: "2026-07-31", warehouse: "YBYD", sku: "SKU-A", quantity: 4.5 },
    ] as const;
    const partial = buildCombinedInventoryBreakdown(
      context([source("google_sheets", "partial")]),
      inventoryFacts,
      false,
    );
    const complete = buildCombinedInventoryBreakdown(
      context([source("google_sheets")]),
      inventoryFacts,
      true,
    );
    expect(partial.metric.value).toBeNull();
    expect(partial.items).toHaveLength(2);
    expect(partial.items[0]?.warnings).toContain("INVENTORY_LOCATION_COVERAGE_INCOMPLETE");
    expect(complete.metric.value).toEqual({ kind: "quantity", value: 15 });

    const cash = buildCashPositionMetric(
      context([source("google_sheets", "partial")]),
      [
        {
          date: "2026-07-31",
          account: "Operating",
          balanceMinorUnits: 500000,
          restrictedCashMinorUnits: null,
        },
      ],
      false,
    );
    expect(cash.value).toBeNull();
    expect(cash.warnings).toContain("CASH_ACCOUNT_COVERAGE_INCOMPLETE");
  });

  it("calculates only matched unit variance and caller-supplied incoming quantities", () => {
    const variance = buildForecastVarianceTable(context([source("google_sheets")]), [
      {
        period: "2026-W27",
        sku: "SKU-A",
        channel: "Website/DTC",
        forecastUnits: 12.5,
        actualUnits: 10,
      },
    ]);
    const incoming = buildIncomingProductionTable(context([source("google_sheets")]), [
      {
        poNumber: "PO-1",
        poLine: "1",
        sku: "SKU-A",
        destinationWarehouse: "SNAPL",
        status: "In Transit",
        expectedArrivalDate: "2026-07-15",
        incomingUnits: 100.5,
        unitsReceived: 0,
      },
    ]);
    expect(variance.metric.value).toEqual({ kind: "quantity", value: -2.5 });
    expect(variance.metric.warnings).toContain("UNIT_VARIANCE_ONLY");
    expect(incoming.metric.value).toEqual({ kind: "quantity", value: 100.5 });
  });

  it("preserves lot rows and explicit Plan/Actual/Variance labels", () => {
    const lots = buildInventoryLotsTable(context([source("google_sheets")]), [
      {
        asOfDate: "2026-07-31",
        warehouse: "SNAPL",
        sku: "SKU-A",
        lotCode: "LOT-1",
        bestByDate: "2027-01-31",
        quantityRemaining: 8.25,
        status: "Available",
      },
    ]);
    const budget = buildBudgetActualBreakdown(context([source("google_sheets")]), [
      { scopeKey: "Warehouse", planMinorUnits: 100000, actualMinorUnits: 90000 },
    ]);
    expect(lots.metric.value).toEqual({ kind: "quantity", value: 8.25 });
    expect(budget.metric.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: -10000 },
    });
    expect(budget.items[0]?.warnings).toEqual(["PLAN", "ACTUAL", "VARIANCE"]);
  });
});

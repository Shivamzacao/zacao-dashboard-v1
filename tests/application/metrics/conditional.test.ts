import { describe, expect, it } from "vitest";

import {
  buildBudgetActualBreakdown,
  buildCashPositionMetric,
  buildCashRunwayMetric,
  buildCombinedInventoryBreakdown,
  buildFefoVisibilityMetric,
  buildForecastVarianceTable,
  buildIncomingProductionTable,
  buildInventoryLotsTable,
  buildInventoryValueMetric,
  buildLowInventoryAlertMetric,
  buildMonthlyBurnMetrics,
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
    expect(partial.items).toEqual([]);
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
        expectedArrivalDate: "2026-08-15",
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

  it("values inventory using the SKU's effective cost row, disclosing SKUs without a cost", () => {
    const inventory = [
      { asOfDate: "2026-08-01", warehouse: "SNAPL", sku: "SKU-A", quantity: 10 },
      { asOfDate: "2026-08-01", warehouse: "YBYD", sku: "SKU-A", quantity: 5 },
      { asOfDate: "2026-08-01", warehouse: "SNAPL", sku: "SKU-B", quantity: 4 },
    ];
    const costs = [
      // Superseded row: must not be picked over the later one.
      { sku: "SKU-A", effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30", totalUnitCostUsd: 1 },
      { sku: "SKU-A", effectiveFrom: "2026-07-01", effectiveTo: null, totalUnitCostUsd: 2.5 },
    ];
    const value = buildInventoryValueMetric(context([source("manual_workbook")]), inventory, costs, "2026-08-01");
    // 15 units of SKU-A at $2.50 = $37.50; SKU-B has no cost row.
    expect(value.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 3750 } });
    expect(value.warnings).toContain("MISSING_SKU_COST");
  });

  it("stays unavailable rather than showing a misleading $0 when no SKU has a cost row", () => {
    const inventory = [{ asOfDate: "2026-08-01", warehouse: "SNAPL", sku: "SKU-A", quantity: 10 }];
    const value = buildInventoryValueMetric(context([source("manual_workbook")]), inventory, [], "2026-08-01");
    expect(value.value).toBeNull();
    expect(value.warnings).toContain("MISSING_SKU_COST");
  });

  it("flags only in-stock lots within the 90-day FEFO horizon", () => {
    const lots = [
      { asOfDate: "2026-08-01", warehouse: "SNAPL", sku: "SKU-A", lotCode: "L1", bestByDate: "2026-08-15", quantityRemaining: 10, status: "in_stock" },
      { asOfDate: "2026-08-01", warehouse: "SNAPL", sku: "SKU-B", lotCode: "L2", bestByDate: "2027-06-01", quantityRemaining: 5, status: "in_stock" },
      { asOfDate: "2026-08-01", warehouse: "SNAPL", sku: "SKU-C", lotCode: "L3", bestByDate: "2026-08-10", quantityRemaining: 3, status: "depleted" },
    ];
    const fefo = buildFefoVisibilityMetric(context([source("manual_workbook")]), lots, "2026-08-01");
    expect(fefo.value).toEqual({ kind: "status", value: "1 lot expiring within 90 days" });
  });

  it("computes monthly burn from cash-basis rows only, and feeds a trailing average", () => {
    const facts = [
      { period: "2026-06", category: "Ops", amountMinorUnits: 100_000, cashOrAccrual: "cash" as const },
      { period: "2026-07", category: "Ops", amountMinorUnits: 200_000, cashOrAccrual: "cash" as const },
      { period: "2026-07", category: "Depreciation", amountMinorUnits: 999_999, cashOrAccrual: "accrual" as const },
    ];
    const burn = buildMonthlyBurnMetrics(context([source("manual_workbook")]), facts);
    expect(burn.metric.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 200_000 } });
    expect(burn.trailing3MonthAverageMinorUnits).toBe(150_000);
  });

  it("converts cash runway into whole days, refusing to divide by zero burn", () => {
    const cashFacts = [{ date: "2026-08-01", account: "all_accounts", balanceMinorUnits: 300_000, restrictedCashMinorUnits: null }];
    const runway = buildCashRunwayMetric(context([source("manual_workbook")]), cashFacts, true, 30_000);
    // $3,000 cash / ($300/month burn ÷ 30 days = $10/day) = 300 days.
    expect(runway.value).toEqual({ kind: "duration_seconds", value: 300 * 86_400 });

    const noBurn = buildCashRunwayMetric(context([source("manual_workbook")]), cashFacts, true, null);
    expect(noBurn.value).toBeNull();
    expect(noBurn.warnings).toContain("NO_BURN_RECORDED");
  });

  it("triggers the low-inventory alert only for SKUs below their configured reorder point", () => {
    const inventory = [
      { asOfDate: "2026-08-01", warehouse: "SNAPL", sku: "SKU-A", quantity: 5 },
      { asOfDate: "2026-08-01", warehouse: "SNAPL", sku: "SKU-B", quantity: 500 },
    ];
    const targets = [
      { metricKey: "inventory.reorder_point", periodStart: "2026-07-01", periodEnd: "2026-07-31", targetValue: 50, unit: "units", scopeType: "sku", scopeValue: "SKU-A", status: "active" },
      { metricKey: "inventory.reorder_point", periodStart: "2026-07-01", periodEnd: "2026-07-31", targetValue: 10, unit: "units", scopeType: "sku", scopeValue: "SKU-B", status: "active" },
    ];
    const alert = buildLowInventoryAlertMetric(context([source("manual_workbook")]), inventory, targets);
    expect(alert.value).toEqual({ kind: "status", value: "1 SKU below reorder point" });
    expect(alert.warnings).toContain("LOW_INVENTORY_TRIGGERED");
  });
});

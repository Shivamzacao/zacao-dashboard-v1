import { describe, expect, it } from "vitest";

import { buildManualWorkbookMetrics } from "@/src/application/metrics";
import {
  APPROVED_INPUT_TABS,
  APPROVED_TAB_CONTRACTS,
  type ApprovedInputTab,
} from "@/src/infrastructure/google/contracts";
import { validateApprovedWorkbook } from "@/src/infrastructure/google/parser";

import { context, source } from "./fixtures";

function workbookRows(): Record<ApprovedInputTab, unknown[][]> {
  return Object.fromEntries(
    APPROVED_INPUT_TABS.map((tab) => [
      tab,
      [APPROVED_TAB_CONTRACTS[tab].columns.map(({ header }) => header)],
    ]),
  ) as Record<ApprovedInputTab, unknown[][]>;
}

describe("B5 governed manual-source calculations", () => {
  it("calculates only validated TEST rows with inclusive date filters and negative corrections", () => {
    const rows = workbookRows();
    rows.Mappings.push(
      ["SKU", "Manual", "SKU-A", "SKU-A", 1, null, "2026-01-01", null],
      ["WAREHOUSE", "Manual", "WH-A", "WH-A", null, null, "2026-01-01", null],
    );
    rows.Finance_Actuals.push(
      ["2026-07-01", "Warehouse", 850, "Synthetic storage", "REF-1"],
      ["2026-07-02", "Warehouse", -50, "Synthetic correction", "REF-2"],
      ["2026-06-30", "Marketing", 999, "Outside selected period", "REF-3"],
    );
    rows.Marketing_Spend.push([
      "2026-07-01",
      "Meta",
      "SYNTHETIC-CAMPAIGN",
      120,
      "Website/DTC",
      25000,
      450,
    ]);
    rows.Depletions.push(["2026-07-03", "WH-A", "SKU-A", 1.5, "Sample", null, null, null]);
    rows.Partner_Performance.push([
      "2026-07-01",
      "2026-07-31",
      "Affiliate",
      "PARTNER-A",
      "ShopMy",
      8,
      720,
      72,
      "Due",
    ]);
    rows.Growth_Pipeline.push([
      "Partnership",
      "OPP-1",
      "Synthetic Opportunity",
      "Discussion",
      "Open",
      "2026-07-01",
      12000,
      "Send proposal",
      "2026-07-10",
      null,
    ]);
    rows.Social_Metrics.push([
      "2026-07-01",
      "Instagram",
      "SYNTHETIC-ACCOUNT",
      2500,
      30000,
      18000,
      1500,
      210,
    ]);
    const workbook = validateApprovedWorkbook({ environment: "test", rowsByTab: rows });
    expect(workbook.state).toBe("ready");

    const result = buildManualWorkbookMetrics(context([source("google_sheets")]), workbook);
    expect(result.metrics.find(({ key }) => key === "finance.actual_expenses")?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 80000 },
    });
    expect(result.metrics.find(({ key }) => key === "marketing.spend")?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 12000 },
    });
    expect(result.metrics.find(({ key }) => key === "marketing.spend")?.warnings).toContain(
      "SPEND_ONLY_NO_ATTRIBUTION",
    );
    expect(
      result.breakdowns.find(({ metric }) => metric.key === "inventory.depletions")?.metric.value,
    ).toEqual({
      kind: "quantity",
      value: 1.5,
    });
    expect(
      result.tables.find(({ metric }) => metric.key === "partners.performance")?.rows,
    ).toHaveLength(0);
    expect(
      result.tables.find(({ metric }) => metric.key === "partners.performance")?.metric.warnings,
    ).toContain("PHASE_2_NOT_CONFIGURED");
  });

  it("returns DATA_PENDING without numeric values for the empty production workbook", () => {
    const workbook = validateApprovedWorkbook({
      environment: "production",
      rowsByTab: workbookRows(),
    });
    expect(workbook.state).toBe("data_source_not_ready");
    const result = buildManualWorkbookMetrics(
      context([source("google_sheets", "no_activity")], "production"),
      workbook,
    );
    expect(result.metrics.every(({ value }) => value === null)).toBe(true);
    expect(result.breakdowns.every(({ metric }) => metric.value === null)).toBe(true);
    expect(result.tables.every(({ metric }) => metric.value === null)).toBe(true);
    expect(
      result.metrics.every(({ implementationStatus }) => implementationStatus === "DATA_PENDING"),
    ).toBe(true);
  });
});

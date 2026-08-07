import { describe, expect, it } from "vitest";

import {
  APPROVED_INPUT_TABS,
  APPROVED_TAB_CONTRACTS,
  validateApprovedWorkbook,
  type ApprovedInputTab,
} from "@/src/infrastructure/google";

function blankWorkbook(): Record<ApprovedInputTab, unknown[][]> {
  return Object.fromEntries(
    APPROVED_INPUT_TABS.map((tab) => [
      tab,
      [APPROVED_TAB_CONTRACTS[tab].columns.map(({ header }) => header)],
    ]),
  ) as Record<ApprovedInputTab, unknown[][]>;
}

function mappedWorkbook(): Record<ApprovedInputTab, unknown[][]> {
  const rows = blankWorkbook();
  rows.Mappings.push(
    ["SKU", "Manual", "SOURCE-SKU-A", "SKU-A", 1, null, "2026-01-01", null],
    ["WAREHOUSE", "Manual", "SOURCE-WH-A", "WH-A", null, null, "2026-01-01", null],
    ["CHANNEL", "Manual", "source-web", "Website/DTC", null, "DTC/Website", "2026-01-01", null],
  );
  return rows;
}

describe("approved Google workbook parser", () => {
  it("accepts a valid workbook and ignores empty rows", () => {
    const rows = mappedWorkbook();
    rows.Inventory.push([], ["2026-08-01", "WH-A", "SKU-A", "System", 12, 10, null], []);
    const result = validateApprovedWorkbook({ environment: "test", rowsByTab: rows });
    expect(result.state).toBe("ready");
    expect(result.tabs.Inventory.records).toHaveLength(1);
    expect(result.issues).toEqual([]);
  });

  it("treats an empty production workbook as data source not ready", () => {
    const result = validateApprovedWorkbook({
      environment: "production",
      rowsByTab: blankWorkbook(),
    });
    expect(result.state).toBe("data_source_not_ready");
    expect(result.populatedRows).toBe(0);
  });

  it("distinguishes missing tabs and renamed required columns as invalid schema", () => {
    const missing = blankWorkbook();
    delete (missing as Partial<typeof missing>).Forecast;
    expect(validateApprovedWorkbook({ environment: "test", rowsByTab: missing }).state).toBe(
      "invalid_schema",
    );

    const renamed = blankWorkbook();
    const inventoryHeader = renamed.Inventory[0];
    if (!inventoryHeader) {
      throw new Error("Inventory fixture header is required");
    }
    renamed.Inventory[0] = ["Renamed Date", ...inventoryHeader.slice(1)];
    const result = validateApprovedWorkbook({ environment: "test", rowsByTab: renamed });
    expect(result.state).toBe("invalid_schema");
    expect(result.issues.some(({ code }) => code === "HEADER_MISMATCH")).toBe(true);
  });

  it("rejects malformed enum, date, numeric, and unmapped values while retaining valid data", () => {
    const rows = mappedWorkbook();
    rows.Inventory.push(
      ["08/01/2026", "WH-A", "SKU-A", "System", 12, 10, null],
      ["2026-08-01", "WH-A", "SKU-A", "Unknown", 12, 10, null],
      ["2026-08-02", "WH-A", "SKU-A", "System", "12", 10, null],
      ["2026-08-03", "WH-A", "UNMAPPED", "System", 12, 10, null],
      ["2026-08-04", "WH-A", "SKU-A", "Physical", 11, null, null],
    );
    const result = validateApprovedWorkbook({ environment: "test", rowsByTab: rows });
    expect(result.state).toBe("partial");
    expect(result.tabs.Inventory.records).toHaveLength(1);
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "INVALID_DATE",
        "INVALID_ENUM",
        "INVALID_NUMBER",
        "UNRESOLVED_MAPPING",
      ]),
    );
  });

  it("rejects every row in a duplicate/conflicting business key instead of choosing a winner", () => {
    const rows = mappedWorkbook();
    rows.Inventory.push(
      ["2026-08-01", "WH-A", "SKU-A", "System", 12, 10, null],
      ["2026-08-01", "WH-A", "SKU-A", "System", 15, 13, null],
    );
    const result = validateApprovedWorkbook({ environment: "test", rowsByTab: rows });
    expect(result.tabs.Inventory.records).toHaveLength(0);
    expect(result.issues.filter(({ code }) => code === "DUPLICATE_BUSINESS_KEY")).toHaveLength(2);
  });

  it("processes populated rows beyond fixture assumptions without a fixed runtime boundary", () => {
    const rows = mappedWorkbook();
    rows.Inventory.length = 1_502;
    rows.Inventory[1_501] = ["2026-08-01", "WH-A", "SKU-A", "System", 12, 10, null];
    const result = validateApprovedWorkbook({ environment: "test", rowsByTab: rows });
    expect(result.tabs.Inventory.records).toHaveLength(1);
    expect(result.tabs.Inventory.populatedRows).toBe(1);
  });

  it("excludes obvious test data from production without repairing it from TEST", () => {
    const rows = mappedWorkbook();
    rows.Growth_Pipeline.push([
      "Retail",
      "TEST-OPPORTUNITY",
      "Synthetic retailer",
      "Intro",
      "Open",
      "2026-08-01",
      100,
      null,
      null,
      null,
    ]);
    const result = validateApprovedWorkbook({ environment: "production", rowsByTab: rows });
    expect(result.tabs.Growth_Pipeline.records).toHaveLength(0);
    expect(result.issues.some(({ code }) => code === "PRODUCTION_TEST_DATA")).toBe(true);
  });
});

import path from "node:path";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  CONTROLLED_LISTS,
  MANUAL_TAB_CONTRACTS,
  MANUAL_WORKBOOK_TABS,
} from "@/src/infrastructure/manual-workbook/contracts.generated";

const FIXTURE = path.join(
  process.cwd(),
  "tests/fixtures/manual-workbook/ZACAO_Dashboard_V1_Input_Workbook.xlsx",
);

describe("generated manual-workbook contracts", () => {
  it("stays in sync with the fixture workbook's Data_Dictionary (drift guard)", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(FIXTURE);
    const dictionary = workbook.getWorksheet("Data_Dictionary");
    expect(dictionary).toBeTruthy();

    const dictionaryColumns = new Map<string, string[]>();
    dictionary?.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = Array.isArray(row.values) ? row.values : [];
      const tab = values[1] ? String(values[1]).trim() : null;
      const column = values[3] ? String(values[3]).trim() : null;
      if (!tab || !column) return;
      dictionaryColumns.set(tab, [...(dictionaryColumns.get(tab) ?? []), column]);
    });

    // Every dictionary tab is a generated contract with identical column order.
    expect([...dictionaryColumns.keys()]).toEqual([...MANUAL_WORKBOOK_TABS]);
    for (const tab of MANUAL_WORKBOOK_TABS) {
      const fixtureColumns = dictionaryColumns.get(tab) ?? [];
      const expectedColumns =
        tab === "Production_Orders"
          ? fixtureColumns.flatMap((column) =>
              column === "received_date" ? [column, "received_units"] : [column],
            )
          : fixtureColumns;
      expect(MANUAL_TAB_CONTRACTS[tab].columns.map(({ header }) => header)).toEqual(
        expectedColumns,
      );
    }
  });

  it("captures kinds, requirements, and controlled lists faithfully", () => {
    const marketingSpend = MANUAL_TAB_CONTRACTS["Marketing_Spend"];
    expect(marketingSpend.tableName).toBe("marketing_spend");
    expect(marketingSpend.businessKey).toEqual(["record_id"]);
    const byHeader = new Map(marketingSpend.columns.map((column) => [column.header, column]));
    expect(byHeader.get("spend_usd")).toMatchObject({ kind: "usd", required: true });
    expect(byHeader.get("impressions")).toMatchObject({ kind: "integer", required: false });
    expect(byHeader.get("date")).toMatchObject({ kind: "date", required: true });
    expect(byHeader.get("created_at")).toMatchObject({ kind: "timestamp", required: false });
    expect(byHeader.get("platform")?.enumValues).toContain("meta");
    expect(byHeader.get("source_status")?.enumValues).toEqual([
      "production",
      "draft",
      "example",
      "invalid",
    ]);

    const pipeline = MANUAL_TAB_CONTRACTS["Growth_Pipeline"];
    const probability = pipeline.columns.find(({ header }) => header === "probability_manual");
    expect(probability).toMatchObject({ kind: "percent", required: false });

    expect(CONTROLLED_LISTS["dashboard_channel"]).toContain("Unclassified");
    expect(CONTROLLED_LISTS["warehouse"]).toContain("SNAPL 3PL");
    expect(MANUAL_TAB_CONTRACTS["SKU_Master"].businessKey).toEqual(["sku_id"]);
  });
});

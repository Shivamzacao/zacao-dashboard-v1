import { readFileSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { isXlsxFile, parseWorkbookRows } from "@/src/infrastructure/manual-workbook/xlsx";

async function buildWorkbookBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Marketing_Spend");
  sheet.addRow(["record_id", "date", "spend_usd", "clicks", "note"]);
  sheet.addRow(["SPD-001", new Date(Date.UTC(2026, 7, 8)), 180.5, 860, "plain"]);
  // Empty spacer row, then a formula cell and a rich-text cell.
  sheet.addRow([]);
  const formulaRow = sheet.addRow(["SPD-002", "2026-08-09", null, null, null]);
  formulaRow.getCell(3).value = { formula: "1+1", result: 2 } as ExcelJS.CellValue;
  formulaRow.getCell(5).value = {
    richText: [{ text: "rich " }, { text: "text" }],
  } as ExcelJS.CellValue;
  sheet.addRow(["SPD-003", new Date(Date.UTC(2026, 7, 8, 9, 15)), 10, 1, null]);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

describe("manual workbook xlsx reader", () => {
  it("rejects non-xlsx bytes via magic-byte check", async () => {
    expect(isXlsxFile(new TextEncoder().encode("not a workbook"))).toBe(false);
    await expect(parseWorkbookRows(new TextEncoder().encode("csv,data"))).rejects.toThrow(
      /not a valid \.xlsx/,
    );
  });

  it("normalizes 1-indexed rows, dates, timestamps, formulas, and rich text", async () => {
    const parsed = await parseWorkbookRows(await buildWorkbookBytes());
    expect(parsed.sheetNames).toEqual(["Marketing_Spend"]);
    const rows = parsed.rowsBySheet["Marketing_Spend"];
    expect(rows?.[0]).toEqual(["record_id", "date", "spend_usd", "clicks", "note"]);
    // Date-only cells render as ISO dates, never timezone-shifted.
    expect(rows?.[1]).toEqual(["SPD-001", "2026-08-08", 180.5, 860, "plain"]);
    // Spacer rows are preserved positionally so spreadsheet row numbers stay true.
    expect(rows?.[2]).toEqual([]);
    // Formula cells yield their computed result; rich text is flattened.
    expect(rows?.[3]).toEqual(["SPD-002", "2026-08-09", 2, null, "rich text"]);
    // Time-of-day cells keep their literal wall-clock reading; trailing empty
    // cells are simply absent (validators treat missing trailing cells as null).
    expect(rows?.[4]).toEqual(["SPD-003", "2026-08-08 09:15:00", 10, 1]);
  });

  it("reads the pristine fixture workbook with all 22 sheets", async () => {
    const bytes = new Uint8Array(
      readFileSync(
        path.join(
          process.cwd(),
          "tests/fixtures/manual-workbook/ZACAO_Dashboard_V1_Input_Workbook.xlsx",
        ),
      ),
    );
    const parsed = await parseWorkbookRows(bytes);
    expect(parsed.sheetNames).toContain("Data_Dictionary");
    expect(parsed.sheetNames).toContain("SKU_Master");
    const skuRows = parsed.rowsBySheet["SKU_Master"];
    expect(skuRows?.[0]?.[0]).toBe("sku_id");
    // 5 master rows + header
    expect(skuRows?.length).toBe(6);
  });
});

import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import {
  APPROVED_BUDGET_TABS,
  APPROVED_GOOGLE_FILE_IDS,
  GoogleReferenceAdapter,
  inspectSopWorkbook,
  parseGoogleSourceConfiguration,
  REQUIRED_GOOGLE_READ_SCOPES,
  type GoogleReadTransport,
} from "@/src/infrastructure/google";

const configuration = parseGoogleSourceConfiguration({
  environment: "test",
  testWorkbookId: APPROVED_GOOGLE_FILE_IDS.testWorkbook,
  productionWorkbookId: APPROVED_GOOGLE_FILE_IDS.productionWorkbook,
  budgetWorkbookId: APPROVED_GOOGLE_FILE_IDS.budgetWorkbook,
  sopWorkbookId: APPROVED_GOOGLE_FILE_IDS.sopWorkbook,
  reportingTimeZone: "America/New_York",
  grantedScopes: [...REQUIRED_GOOGLE_READ_SCOPES],
  requestTimeoutMs: 5_000,
  rowChunkSize: 100,
});

describe("approved Budget and S&OP read paths", () => {
  it("labels Budget strictly as a plan/reference source and reports formula errors", async () => {
    const source: GoogleReadTransport = {
      readFileMetadata: vi.fn(async () => ({
        id: APPROVED_GOOGLE_FILE_IDS.budgetWorkbook,
        name: "Zacao 12-Month Budget V5 — Corrected Model",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-08-03T00:00:00.000Z",
        size: null,
      })),
      readSpreadsheetMetadata: vi.fn(async () => ({
        spreadsheetId: APPROVED_GOOGLE_FILE_IDS.budgetWorkbook,
        title: "Zacao 12-Month Budget V5 — Corrected Model",
        timeZone: "America/Los_Angeles",
        sheets: APPROVED_BUDGET_TABS.map((title) => ({ title, rowCount: 2, columnCount: 2 })),
      })),
      readTabRows: vi.fn(async ({ sheetTitle }) =>
        sheetTitle === "COGS"
          ? [
              ["Plan", "Value"],
              ["Reference", "#REF!"],
            ]
          : [["Plan", "Value"]],
      ),
      downloadFile: vi.fn(async () => new Uint8Array()),
    };
    const result = await new GoogleReferenceAdapter(source, configuration).readBudget();
    expect(result.classification).toBe("plan_reference_only");
    expect(result.missingTabs).toEqual([]);
    expect(result.formulaErrorCells).toEqual(["COGS!B2"]);
    expect(result.timeZone).toBe("America/Los_Angeles");
  });

  it("inspects an XLSX read-only for formulas, errors, and placeholders", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Production Schedule");
    sheet.getCell("A1").value = "Example placeholder";
    sheet.getCell("B1").value = { formula: "1/0", result: { error: "#DIV/0!" } };
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    const inspection = await inspectSopWorkbook(bytes);
    expect(inspection.classification).toBe("operational_reference_with_known_limitations");
    expect(inspection.formulaCount).toBe(1);
    expect(inspection.formulaErrorCells).toEqual(["Production Schedule!B1"]);
    expect(inspection.placeholderCellCount).toBe(1);
  });
});

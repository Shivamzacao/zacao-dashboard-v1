import ExcelJS from "exceljs";

import type { GoogleReadTransport, GoogleFileMetadata } from "./client";
import type { GoogleSourceConfiguration } from "./config";
import { APPROVED_GOOGLE_FILE_IDS } from "./config";
import { columnLetter } from "./contracts";

const NATIVE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const APPROVED_BUDGET_TABS = [
  "Assumptions",
  "COGS",
  "12-Month P&L",
  "Budget",
  "Channel ROI",
  "AAA Details",
  "Seasonal SKU Plan",
  "Revenue Scenarios",
  "Freight Analysis",
  "SKU Channel Mix",
  "SKU-Channel Detail",
] as const;

export interface BudgetReferenceResult {
  readonly classification: "plan_reference_only";
  readonly file: GoogleFileMetadata;
  readonly timeZone: string;
  readonly tabs: Readonly<Record<string, readonly (readonly unknown[])[]>>;
  readonly missingTabs: readonly string[];
  readonly formulaErrorCells: readonly string[];
}

export interface SopWorkbookInspection {
  readonly classification: "operational_reference_with_known_limitations";
  readonly worksheetNames: readonly string[];
  readonly nonEmptyCellCount: number;
  readonly formulaCount: number;
  readonly formulaErrorCells: readonly string[];
  readonly placeholderCellCount: number;
}

export class GoogleReferenceAdapter {
  constructor(
    private readonly client: GoogleReadTransport,
    private readonly configuration: GoogleSourceConfiguration,
  ) {}

  async readBudget(signal?: AbortSignal): Promise<BudgetReferenceResult> {
    const file = await this.client.readFileMetadata(this.configuration.budgetWorkbookId, signal);
    if (
      file.id !== APPROVED_GOOGLE_FILE_IDS.budgetWorkbook ||
      file.mimeType !== NATIVE_SHEET_MIME
    ) {
      throw new Error("Budget source does not match the approved native Sheet identity");
    }
    const metadata = await this.client.readSpreadsheetMetadata(file.id, signal);
    const tabs: Record<string, readonly (readonly unknown[])[]> = {};
    const missingTabs: string[] = [];
    const formulaErrorCells: string[] = [];
    for (const tab of APPROVED_BUDGET_TABS) {
      const sheet = metadata.sheets.find(({ title }) => title === tab);
      if (!sheet) {
        missingTabs.push(tab);
        continue;
      }
      const rows = await this.client.readTabRows({
        spreadsheetId: file.id,
        sheetTitle: tab,
        lastColumn: columnLetter(sheet.columnCount),
        physicalRowCount: sheet.rowCount,
        renderOption: "FORMATTED_VALUE",
        ...(signal === undefined ? {} : { signal }),
      });
      tabs[tab] = rows;
      rows.forEach((row, rowIndex) =>
        row.forEach((value, columnIndex) => {
          if (
            typeof value === "string" &&
            /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)$/.test(value)
          ) {
            formulaErrorCells.push(`${tab}!${columnLetter(columnIndex + 1)}${rowIndex + 1}`);
          }
        }),
      );
    }
    return {
      classification: "plan_reference_only",
      file,
      timeZone: metadata.timeZone,
      tabs,
      missingTabs,
      formulaErrorCells,
    };
  }

  async readSop(signal?: AbortSignal): Promise<{
    readonly file: GoogleFileMetadata;
    readonly inspection: SopWorkbookInspection;
  }> {
    const file = await this.client.readFileMetadata(this.configuration.sopWorkbookId, signal);
    if (file.id !== APPROVED_GOOGLE_FILE_IDS.sopWorkbook || file.mimeType !== XLSX_MIME) {
      throw new Error("S&OP source does not match the approved XLSX identity");
    }
    const bytes = await this.client.downloadFile(file.id, signal);
    return { file, inspection: await inspectSopWorkbook(bytes) };
  }
}

export async function inspectSopWorkbook(bytes: Uint8Array): Promise<SopWorkbookInspection> {
  const workbook = new ExcelJS.Workbook();
  const workbookBytes = Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(workbookBytes);
  const formulaErrorCells: string[] = [];
  let nonEmptyCellCount = 0;
  let formulaCount = 0;
  let placeholderCellCount = 0;
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        nonEmptyCellCount += 1;
        if (cell.formula) formulaCount += 1;
        const value = cell.result ?? cell.value;
        if (
          (typeof value === "object" && value !== null && "error" in value) ||
          (typeof value === "string" &&
            /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)$/.test(value))
        ) {
          formulaErrorCells.push(`${worksheet.name}!${cell.address}`);
        }
        if (
          typeof value === "string" &&
          /\b(?:example|placeholder|tbc|to be confirmed)\b/i.test(value)
        ) {
          placeholderCellCount += 1;
        }
      });
    });
  }
  return {
    classification: "operational_reference_with_known_limitations",
    worksheetNames: workbook.worksheets.map(({ name }) => name),
    nonEmptyCellCount,
    formulaCount,
    formulaErrorCells,
    placeholderCellCount,
  };
}

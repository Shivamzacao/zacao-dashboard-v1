import type { SourceStatus } from "@/src/domain/contracts/source-status";

import type { GoogleReadTransport, GoogleFileMetadata } from "./client";
import { GoogleClientError } from "./client";
import type { GoogleSourceConfiguration } from "./config";
import {
  APPROVED_INPUT_TABS,
  APPROVED_TAB_CONTRACTS,
  columnLetter,
  type ApprovedInputTab,
} from "./contracts";
import {
  type GoogleValidationIssue,
  type GoogleWorkbookState,
  type GoogleWorkbookValidation,
  validateApprovedWorkbook,
} from "./parser";
import { googleSourceStatus } from "./source-status";

const NATIVE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";

export interface GoogleWorkbookReadResult {
  readonly state: GoogleWorkbookState;
  readonly validation: GoogleWorkbookValidation | null;
  readonly file: GoogleFileMetadata | null;
  readonly sourceStatus: SourceStatus;
  readonly issues: readonly GoogleValidationIssue[];
}

function expectedTitle(environment: "test" | "production"): string {
  return environment === "production"
    ? "ZACAO Dashboard V1 — PRODUCTION"
    : "ZACAO Dashboard V1 — TEST";
}

function failureState(error: unknown): GoogleWorkbookState {
  if (
    error instanceof GoogleClientError &&
    ["authentication", "permission", "not_found"].includes(error.kind)
  ) {
    return "unavailable";
  }
  return "unavailable";
}

export class GoogleWorkbookAdapter {
  constructor(
    private readonly client: GoogleReadTransport,
    private readonly configuration: GoogleSourceConfiguration,
    private readonly now: () => string,
  ) {}

  async read(signal?: AbortSignal): Promise<GoogleWorkbookReadResult> {
    const checkedAt = this.now();
    let file: GoogleFileMetadata | null = null;
    try {
      file = await this.client.readFileMetadata(this.configuration.activeWorkbookId, signal);
      const metadata = await this.client.readSpreadsheetMetadata(
        this.configuration.activeWorkbookId,
        signal,
      );
      const identityIssues: GoogleValidationIssue[] = [];
      if (file.id !== this.configuration.activeWorkbookId || metadata.spreadsheetId !== file.id) {
        identityIssues.push({
          code: "WORKBOOK_ID_MISMATCH",
          tab: "WORKBOOK",
          row: null,
          column: null,
          message: "Workbook identity does not match the allowlisted ID",
        });
      }
      if (file.mimeType !== NATIVE_SHEET_MIME) {
        identityIssues.push({
          code: "INVALID_WORKBOOK_TYPE",
          tab: "WORKBOOK",
          row: null,
          column: null,
          message: "Approved workbook must be a native Google Sheet",
        });
      }
      if (
        file.name !== expectedTitle(this.configuration.environment) ||
        metadata.title !== file.name
      ) {
        identityIssues.push({
          code: "WORKBOOK_TITLE_MISMATCH",
          tab: "WORKBOOK",
          row: null,
          column: null,
          message: "Workbook title/environment marker does not match configuration",
        });
      }
      if (metadata.timeZone !== this.configuration.reportingTimeZone) {
        identityIssues.push({
          code: "WORKBOOK_TIMEZONE_MISMATCH",
          tab: "WORKBOOK",
          row: null,
          column: null,
          message: "Workbook timezone does not match America/New_York",
        });
      }

      const rowsByTab: Partial<Record<ApprovedInputTab, readonly (readonly unknown[])[]>> = {};
      for (const tab of APPROVED_INPUT_TABS) {
        const sheet = metadata.sheets.find(({ title }) => title === tab);
        if (!sheet) continue;
        const contract = APPROVED_TAB_CONTRACTS[tab];
        rowsByTab[tab] = await this.client.readTabRows({
          spreadsheetId: metadata.spreadsheetId,
          sheetTitle: tab,
          lastColumn: columnLetter(contract.columns.length),
          physicalRowCount: sheet.rowCount,
          ...(signal === undefined ? {} : { signal }),
        });
      }
      const validation = validateApprovedWorkbook({
        environment: this.configuration.environment,
        rowsByTab,
      });
      const issues = [...identityIssues, ...validation.issues];
      const state: GoogleWorkbookState =
        identityIssues.length > 0 ? "invalid_schema" : validation.state;
      return {
        state,
        validation,
        file,
        issues,
        sourceStatus: googleSourceStatus({
          source: "google_sheets",
          state,
          checkedAt,
          modifiedAt: file.modifiedTime,
          warningCodes: issues.map(({ code }) => code),
        }),
      };
    } catch (error) {
      const state = failureState(error);
      const code =
        error instanceof GoogleClientError
          ? `GOOGLE_${error.kind.toUpperCase()}`
          : "GOOGLE_UNEXPECTED_ERROR";
      return {
        state,
        validation: null,
        file,
        issues: [
          {
            code,
            tab: "WORKBOOK",
            row: null,
            column: null,
            message: "Google source is unavailable",
          },
        ],
        sourceStatus: googleSourceStatus({
          source: "google_sheets",
          state,
          checkedAt,
          modifiedAt: file?.modifiedTime ?? null,
          warningCodes: [code],
        }),
      };
    }
  }
}

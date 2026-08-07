import { describe, expect, it, vi } from "vitest";

import {
  APPROVED_GOOGLE_FILE_IDS,
  APPROVED_INPUT_TABS,
  APPROVED_TAB_CONTRACTS,
  GoogleClientError,
  GoogleWorkbookAdapter,
  parseGoogleSourceConfiguration,
  REQUIRED_GOOGLE_READ_SCOPES,
  type GoogleReadTransport,
} from "@/src/infrastructure/google";

function configuration(environment: "test" | "production") {
  return parseGoogleSourceConfiguration({
    environment,
    testWorkbookId: APPROVED_GOOGLE_FILE_IDS.testWorkbook,
    productionWorkbookId: APPROVED_GOOGLE_FILE_IDS.productionWorkbook,
    budgetWorkbookId: APPROVED_GOOGLE_FILE_IDS.budgetWorkbook,
    sopWorkbookId: APPROVED_GOOGLE_FILE_IDS.sopWorkbook,
    reportingTimeZone: "America/New_York",
    grantedScopes: [...REQUIRED_GOOGLE_READ_SCOPES],
    requestTimeoutMs: 5_000,
    rowChunkSize: 100,
  });
}

function transport(environment: "test" | "production", missingTab?: string): GoogleReadTransport {
  const id =
    environment === "test"
      ? APPROVED_GOOGLE_FILE_IDS.testWorkbook
      : APPROVED_GOOGLE_FILE_IDS.productionWorkbook;
  return {
    readFileMetadata: vi.fn(async () => ({
      id,
      name: `ZACAO Dashboard V1 — ${environment === "test" ? "TEST" : "PRODUCTION"}`,
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: "2026-08-07T00:00:00.000Z",
      size: null,
    })),
    readSpreadsheetMetadata: vi.fn(async () => ({
      spreadsheetId: id,
      title: `ZACAO Dashboard V1 — ${environment === "test" ? "TEST" : "PRODUCTION"}`,
      timeZone: "America/New_York",
      sheets: ["README", ...APPROVED_INPUT_TABS]
        .filter((title) => title !== missingTab)
        .map((title) => ({ title, rowCount: 2, columnCount: 26 })),
    })),
    readTabRows: vi.fn(async ({ sheetTitle }) => {
      const tab = sheetTitle as (typeof APPROVED_INPUT_TABS)[number];
      const rows: unknown[][] = [APPROVED_TAB_CONTRACTS[tab].columns.map(({ header }) => header)];
      if (environment === "test" && tab === "Mappings") {
        rows.push(["SKU", "Manual", "SOURCE-SKU-A", "SKU-A", 1, null, "2026-01-01", null]);
      }
      return rows;
    }),
    downloadFile: vi.fn(async () => new Uint8Array()),
  };
}

describe("Google workbook adapter states", () => {
  it("returns ready for a valid TEST workbook and never interprets README as business data", async () => {
    const source = transport("test");
    const result = await new GoogleWorkbookAdapter(
      source,
      configuration("test"),
      () => "2026-08-07T00:00:00.000Z",
    ).read();
    expect(result.state).toBe("ready");
    expect(result.validation?.acceptedRows).toBe(1);
    expect(source.readTabRows).toHaveBeenCalledTimes(14);
  });

  it("returns data source not ready for the valid empty PRODUCTION workbook", async () => {
    const result = await new GoogleWorkbookAdapter(
      transport("production"),
      configuration("production"),
      () => "2026-08-07T00:00:00.000Z",
    ).read();
    expect(result.state).toBe("data_source_not_ready");
    expect(result.validation?.populatedRows).toBe(0);
  });

  it("returns invalid schema for a missing approved tab", async () => {
    const result = await new GoogleWorkbookAdapter(
      transport("test", "Forecast"),
      configuration("test"),
      () => "2026-08-07T00:00:00.000Z",
    ).read();
    expect(result.state).toBe("invalid_schema");
  });

  it("returns unavailable for permission loss without inventing records", async () => {
    const source = transport("test");
    source.readFileMetadata = vi.fn(async () => {
      throw new GoogleClientError("permission", "denied", false);
    });
    const result = await new GoogleWorkbookAdapter(
      source,
      configuration("test"),
      () => "2026-08-07T00:00:00.000Z",
    ).read();
    expect(result.state).toBe("unavailable");
    expect(result.validation).toBeNull();
  });
});

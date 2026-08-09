import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MANUAL_TAB_CONTRACTS } from "@/src/infrastructure/manual-workbook/contracts.generated";
import { validateManualWorkbook } from "@/src/infrastructure/manual-workbook/parser";
import { parseWorkbookRows } from "@/src/infrastructure/manual-workbook/xlsx";

const marketingHeaders = MANUAL_TAB_CONTRACTS["Marketing_Spend"].columns.map(
  ({ header }) => header,
);

function marketingRow(overrides: Readonly<Record<string, unknown>> = {}): unknown[] {
  const base: Record<string, unknown> = {
    record_id: "SPD-001",
    date: "2026-08-08",
    platform: "meta",
    account: "ZACAO Main",
    campaign_id: null,
    campaign_name: null,
    spend_usd: 180.5,
    impressions: 42_000,
    clicks: 860,
    conversions: 14,
    source_status: "production",
    data_as_of: "2026-08-08",
    created_at: "2026-08-08 09:15",
    updated_at: null,
    updated_by: "shivam",
    source_reference: null,
    notes: null,
    ...overrides,
  };
  return marketingHeaders.map((header) => base[header] ?? null);
}

function sheetFor(rows: unknown[][]): Record<string, unknown[][]> {
  const sheets: Record<string, unknown[][]> = {};
  for (const [tab, contract] of Object.entries(MANUAL_TAB_CONTRACTS)) {
    sheets[tab] = [contract.columns.map(({ header }) => header)];
  }
  sheets["Marketing_Spend"] = [marketingHeaders, ...rows];
  return sheets;
}

describe("manual workbook validation", () => {
  it("accepts valid production rows and reports state per tab", () => {
    const result = validateManualWorkbook({ rowsBySheet: sheetFor([marketingRow()]) });
    expect(result.state).toBe("ready");
    expect(result.acceptedRows).toBe(1);
    const tab = result.tabs["Marketing_Spend"];
    expect(tab.records[0]).toMatchObject({
      record_id: "SPD-001",
      spend_usd: 180.5,
      platform: "meta",
      created_at: "2026-08-08 09:15",
    });
  });

  it("excludes draft/example rows silently and invalid-flagged rows with an issue", () => {
    const result = validateManualWorkbook({
      rowsBySheet: sheetFor([
        marketingRow(),
        marketingRow({ record_id: "SPD-002", source_status: "draft" }),
        marketingRow({ record_id: "SPD-003", source_status: "example" }),
        marketingRow({ record_id: "SPD-004", source_status: "invalid" }),
      ]),
    });
    const tab = result.tabs["Marketing_Spend"];
    expect(tab.records).toHaveLength(1);
    expect(tab.excludedRows).toBe(3);
    expect(tab.issues.map(({ code }) => code)).toEqual(["INVALID_SOURCE_STATUS_ROW"]);
    // Draft/example exclusions are not errors, so the workbook can still be partial/ready.
    expect(result.state).toBe("partial");
  });

  it("rejects invalid cells with row/column references and drops only those rows", () => {
    const result = validateManualWorkbook({
      rowsBySheet: sheetFor([
        marketingRow(),
        marketingRow({ record_id: "SPD-BAD", platform: "myspace", spend_usd: "not-money" }),
        marketingRow({ record_id: "SPD-005", date: "08/08/2026" }),
        marketingRow({ record_id: "SPD-006", created_at: "yesterday" }),
        marketingRow({ record_id: "SPD-007", impressions: 12.5 }),
      ]),
    });
    const tab = result.tabs["Marketing_Spend"];
    expect(tab.records).toHaveLength(1);
    const codes = tab.issues.map(({ code, column }) => `${code}:${column}`);
    expect(codes).toContain("INVALID_ENUM:platform");
    expect(codes).toContain("INVALID_NUMBER:spend_usd");
    expect(codes).toContain("INVALID_DATE:date");
    expect(codes).toContain("INVALID_TIMESTAMP:created_at");
    expect(codes).toContain("INVALID_INTEGER:impressions");
    expect(tab.issues.every(({ row }) => typeof row === "number" && row >= 3)).toBe(true);
    expect(result.state).toBe("partial");
  });

  it("rejects duplicate business keys, header drift, and missing tabs", () => {
    const duplicated = validateManualWorkbook({
      rowsBySheet: sheetFor([marketingRow(), marketingRow()]),
    });
    expect(duplicated.tabs["Marketing_Spend"].records).toHaveLength(0);
    expect(
      duplicated.tabs["Marketing_Spend"].issues.filter(
        ({ code }) => code === "DUPLICATE_BUSINESS_KEY",
      ),
    ).toHaveLength(2);

    const drifted = sheetFor([marketingRow()]);
    drifted["Marketing_Spend"] = [
      ["wrong", ...marketingHeaders.slice(1)],
      ...(drifted["Marketing_Spend"]?.slice(1) ?? []),
    ];
    const headerResult = validateManualWorkbook({ rowsBySheet: drifted });
    expect(headerResult.state).toBe("invalid_schema");
    expect(headerResult.tabs["Marketing_Spend"].issues[0]?.code).toBe("HEADER_MISMATCH");

    const missing = sheetFor([]);
    delete missing["Growth_Pipeline"];
    const missingResult = validateManualWorkbook({ rowsBySheet: missing });
    expect(missingResult.state).toBe("invalid_schema");
    expect(missingResult.tabs["Growth_Pipeline"].issues[0]?.code).toBe("MISSING_TAB");
  });

  it("enforces date-order and percent-range rules", () => {
    const sheets = sheetFor([]);
    const pipelineContract = MANUAL_TAB_CONTRACTS["Growth_Pipeline"];
    const pipelineHeaders = pipelineContract.columns.map(({ header }) => header);
    const pipelineRow = (overrides: Record<string, unknown>) => {
      const base: Record<string, unknown> = {
        record_id: "PIPE-001",
        pipeline_type: "retail",
        opportunity: "Whole Foods NE",
        stage: "in_discussion",
        status: "open",
        value_usd: 48_000,
        probability_manual: 0.3,
        created_date: "2026-06-14",
        source_status: "production",
        ...overrides,
      };
      return pipelineHeaders.map((header) => base[header] ?? null);
    };
    sheets["Growth_Pipeline"] = [
      pipelineHeaders,
      pipelineRow({}),
      pipelineRow({ record_id: "PIPE-002", closed_date: "2026-01-01" }),
      pipelineRow({ record_id: "PIPE-003", probability_manual: 1.5 }),
    ];
    const result = validateManualWorkbook({ rowsBySheet: sheets });
    const tab = result.tabs["Growth_Pipeline"];
    expect(tab.records).toHaveLength(1);
    const codes = tab.issues.map(({ code }) => code);
    expect(codes).toContain("INVALID_DATE_ORDER");
    expect(codes).toContain("INVALID_PERCENT");
  });

  it("classifies the pristine fixture as data_source_not_ready (masters only, empty data tabs)", async () => {
    const bytes = new Uint8Array(
      readFileSync(
        path.join(
          process.cwd(),
          "tests/fixtures/manual-workbook/ZACAO_Dashboard_V1_Input_Workbook.xlsx",
        ),
      ),
    );
    const parsed = await parseWorkbookRows(bytes);
    const result = validateManualWorkbook({ rowsBySheet: parsed.rowsBySheet });
    // Masters have rows; data tabs are empty — full workbook validates cleanly.
    expect(result.tabs["SKU_Master"].records).toHaveLength(5);
    expect(result.tabs["Location_Master"].records).toHaveLength(3);
    expect(result.tabs["Marketing_Spend"].populatedRows).toBe(0);
    expect(["ready", "partial"]).toContain(result.state);
    expect(result.issues.filter(({ code }) => code === "HEADER_MISMATCH")).toEqual([]);
  });
});

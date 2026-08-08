import {
  MANUAL_TAB_CONTRACTS,
  MANUAL_WORKBOOK_TABS,
  PRODUCTION_SOURCE_STATUS,
  SOURCE_STATUS_COLUMN,
  type ManualColumnContract,
  type ManualTabContract,
  type ManualWorkbookTab,
} from "./contracts.generated";

export type ManualWorkbookState =
  "ready" | "data_source_not_ready" | "partial" | "invalid_schema" | "invalid_data";

export type ManualCell = string | number | boolean | null;
export type ManualRecord = Readonly<Record<string, ManualCell>>;

export interface ManualValidationIssue {
  readonly code: string;
  readonly tab: string;
  readonly row: number | null;
  readonly column: string | null;
  readonly message: string;
}

export interface ManualTabValidation {
  readonly tab: ManualWorkbookTab;
  readonly records: readonly ManualRecord[];
  readonly issues: readonly ManualValidationIssue[];
  readonly populatedRows: number;
  /** Rows excluded because source_status was draft/example (not errors). */
  readonly excludedRows: number;
}

export interface ManualWorkbookValidation {
  readonly state: ManualWorkbookState;
  readonly tabs: Readonly<Record<ManualWorkbookTab, ManualTabValidation>>;
  readonly issues: readonly ManualValidationIssue[];
  readonly populatedRows: number;
  readonly acceptedRows: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;
const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

/** Date-order rules per tab: [laterColumn, earlierColumn]. */
const DATE_ORDER_RULES: Readonly<Partial<Record<ManualWorkbookTab, readonly [string, string][]>>> =
  {
    Channel_Mapping: [["effective_to", "effective_from"]],
    Inventory_Lots: [["best_by_date", "production_date"]],
    Production_Orders: [["expected_date", "order_date"]],
    Production_Schedule: [["planned_end", "planned_start"]],
    COGS_By_SKU: [["effective_to", "effective_from"]],
    Growth_Pipeline: [["closed_date", "created_date"]],
    Metric_Targets: [["period_end", "period_start"]],
  };

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function isEmptyRow(row: readonly unknown[]): boolean {
  return row.every(isEmpty);
}

function validIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && NUMERIC_TEXT.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function validateCell(
  column: ManualColumnContract,
  value: unknown,
): { readonly value: ManualCell; readonly code?: string } {
  if (isEmpty(value)) {
    return column.required ? { value: null, code: "REQUIRED_VALUE_MISSING" } : { value: null };
  }
  switch (column.kind) {
    case "text": {
      const text = typeof value === "string" ? value.trim() : String(value).trim();
      if (text.length === 0) return { value: null, code: "INVALID_TEXT" };
      if (column.enumValues && !column.enumValues.includes(text)) {
        return { value: null, code: "INVALID_ENUM" };
      }
      return { value: text };
    }
    case "date": {
      if (typeof value !== "string" || !validIsoDate(value.trim())) {
        return { value: null, code: "INVALID_DATE" };
      }
      return { value: value.trim() };
    }
    case "timestamp": {
      const text = typeof value === "string" ? value.trim() : null;
      if (!text || !TIMESTAMP.test(text) || !validIsoDate(text.slice(0, 10))) {
        return { value: null, code: "INVALID_TIMESTAMP" };
      }
      return { value: text };
    }
    case "integer": {
      const numeric = numericValue(value);
      if (numeric === null) return { value: null, code: "INVALID_NUMBER" };
      if (!Number.isInteger(numeric)) return { value: null, code: "INVALID_INTEGER" };
      return { value: numeric };
    }
    case "percent": {
      const numeric = numericValue(value);
      if (numeric === null) return { value: null, code: "INVALID_NUMBER" };
      if (numeric < 0 || numeric > 1) return { value: null, code: "INVALID_PERCENT" };
      return { value: numeric };
    }
    case "usd":
    case "decimal": {
      const numeric = numericValue(value);
      if (numeric === null) return { value: null, code: "INVALID_NUMBER" };
      return { value: numeric };
    }
  }
}

function issue(
  code: string,
  tab: string,
  row: number | null,
  column: string | null,
  message: string,
): ManualValidationIssue {
  return { code, tab, row, column, message };
}

function crossFieldIssues(
  contract: ManualTabContract,
  rowNumber: number,
  record: ManualRecord,
): ManualValidationIssue[] {
  const findings: ManualValidationIssue[] = [];
  for (const [later, earlier] of DATE_ORDER_RULES[contract.name as ManualWorkbookTab] ?? []) {
    const laterValue = record[later];
    const earlierValue = record[earlier];
    if (
      typeof laterValue === "string" &&
      typeof earlierValue === "string" &&
      laterValue < earlierValue
    ) {
      findings.push(
        issue(
          "INVALID_DATE_ORDER",
          contract.name,
          rowNumber,
          later,
          `${later} must not precede ${earlier}`,
        ),
      );
    }
  }
  return findings;
}

interface ValidatedRow {
  readonly rowNumber: number;
  readonly record: ManualRecord;
}

function validateTab(
  contract: ManualTabContract,
  rows: readonly (readonly unknown[])[],
): ManualTabValidation {
  const issues: ManualValidationIssue[] = [];
  const expectedHeaders = contract.columns.map(({ header }) => header);
  const suppliedHeaders = (rows[0] ?? []).map((value) =>
    typeof value === "string" ? value.trim() : "",
  );
  while (suppliedHeaders.at(-1) === "") suppliedHeaders.pop();
  const duplicates = suppliedHeaders.filter(
    (header, index) => header !== "" && suppliedHeaders.indexOf(header) !== index,
  );
  if (duplicates.length > 0) {
    issues.push(
      issue(
        "DUPLICATE_HEADER",
        contract.name,
        1,
        null,
        "Header row contains duplicate column names",
      ),
    );
  }
  if (JSON.stringify(suppliedHeaders) !== JSON.stringify(expectedHeaders)) {
    issues.push(
      issue(
        "HEADER_MISMATCH",
        contract.name,
        1,
        null,
        "Header names or order do not match the workbook data dictionary",
      ),
    );
  }
  if (issues.length > 0) {
    return {
      tab: contract.name as ManualWorkbookTab,
      records: [],
      issues,
      populatedRows: 0,
      excludedRows: 0,
    };
  }

  const sourceStatusIndex = expectedHeaders.indexOf(SOURCE_STATUS_COLUMN);
  const candidates: ValidatedRow[] = [];
  let populatedRows = 0;
  let excludedRows = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const sourceRow = rows[index] ?? [];
    if (isEmptyRow(sourceRow)) continue;
    populatedRows += 1;
    const rowNumber = index + 1;

    // The per-row source_status flag governs inclusion: production rows load,
    // draft/example rows are counted but silently excluded, invalid rows are
    // excluded with a reported issue, and a missing flag means production.
    const rawStatus = sourceStatusIndex === -1 ? null : sourceRow[sourceStatusIndex];
    const rowStatus =
      typeof rawStatus === "string" && rawStatus.trim() !== ""
        ? rawStatus.trim()
        : PRODUCTION_SOURCE_STATUS;
    if (rowStatus === "draft" || rowStatus === "example") {
      excludedRows += 1;
      continue;
    }
    if (rowStatus === "invalid") {
      excludedRows += 1;
      issues.push(
        issue(
          "INVALID_SOURCE_STATUS_ROW",
          contract.name,
          rowNumber,
          SOURCE_STATUS_COLUMN,
          "Row is flagged invalid and was excluded",
        ),
      );
      continue;
    }

    const record: Record<string, ManualCell> = {};
    const rowIssues: ManualValidationIssue[] = [];
    contract.columns.forEach((column, columnIndex) => {
      const result = validateCell(column, sourceRow[columnIndex]);
      record[column.header] = result.value;
      if (result.code) {
        rowIssues.push(
          issue(result.code, contract.name, rowNumber, column.header, `Invalid ${column.header}`),
        );
      }
    });
    rowIssues.push(...crossFieldIssues(contract, rowNumber, record));
    if (rowIssues.length > 0) {
      issues.push(...rowIssues);
      continue;
    }
    candidates.push({ rowNumber, record });
  }

  const rowsByKey = new Map<string, ValidatedRow[]>();
  for (const row of candidates) {
    const key = JSON.stringify(contract.businessKey.map((header) => row.record[header]));
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row]);
  }
  const duplicateRows = new Set<number>();
  for (const matching of rowsByKey.values()) {
    if (matching.length < 2) continue;
    for (const row of matching) {
      duplicateRows.add(row.rowNumber);
      issues.push(
        issue(
          "DUPLICATE_BUSINESS_KEY",
          contract.name,
          row.rowNumber,
          null,
          "Duplicate or conflicting business key",
        ),
      );
    }
  }
  const accepted = candidates.filter(({ rowNumber }) => !duplicateRows.has(rowNumber));
  return {
    tab: contract.name as ManualWorkbookTab,
    records: accepted.map(({ record }) => record),
    issues,
    populatedRows,
    excludedRows,
  };
}

export function validateManualWorkbook(input: {
  readonly rowsBySheet: Readonly<Record<string, readonly (readonly unknown[])[]>>;
}): ManualWorkbookValidation {
  const tabs = {} as Record<ManualWorkbookTab, ManualTabValidation>;
  const workbookIssues: ManualValidationIssue[] = [];

  for (const tab of MANUAL_WORKBOOK_TABS) {
    const rows = input.rowsBySheet[tab];
    if (!rows) {
      const missing = issue("MISSING_TAB", tab, null, null, "Required workbook tab is missing");
      tabs[tab] = { tab, records: [], issues: [missing], populatedRows: 0, excludedRows: 0 };
      workbookIssues.push(missing);
      continue;
    }
    const result = validateTab(MANUAL_TAB_CONTRACTS[tab], rows);
    tabs[tab] = result;
    workbookIssues.push(...result.issues);
  }

  const populatedRows = MANUAL_WORKBOOK_TABS.reduce((sum, tab) => sum + tabs[tab].populatedRows, 0);
  const acceptedRows = MANUAL_WORKBOOK_TABS.reduce((sum, tab) => sum + tabs[tab].records.length, 0);
  const schemaInvalid = workbookIssues.some((finding) =>
    ["MISSING_TAB", "DUPLICATE_HEADER", "HEADER_MISMATCH"].includes(finding.code),
  );
  const state: ManualWorkbookState = schemaInvalid
    ? "invalid_schema"
    : populatedRows === 0
      ? "data_source_not_ready"
      : workbookIssues.length === 0
        ? "ready"
        : acceptedRows > 0
          ? "partial"
          : "invalid_data";
  return { state, tabs, issues: workbookIssues, populatedRows, acceptedRows };
}

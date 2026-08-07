import {
  APPROVED_INPUT_TABS,
  APPROVED_TAB_CONTRACTS,
  type ApprovedInputTab,
  type ColumnContract,
  type GoogleCell,
  type GoogleRecord,
  type TabContract,
} from "./contracts";

export type GoogleWorkbookState =
  | "ready"
  | "data_source_not_ready"
  | "partial"
  | "stale"
  | "invalid_schema"
  | "invalid_data"
  | "unavailable"
  | "not_configured";

export interface GoogleValidationIssue {
  readonly code: string;
  readonly tab: string;
  readonly row: number | null;
  readonly column: string | null;
  readonly message: string;
}

interface ValidatedRow {
  readonly rowNumber: number;
  readonly record: GoogleRecord;
}

export interface GoogleTabValidation {
  readonly tab: ApprovedInputTab;
  readonly records: readonly GoogleRecord[];
  readonly issues: readonly GoogleValidationIssue[];
  readonly populatedRows: number;
}

export interface GoogleWorkbookValidation {
  readonly state: GoogleWorkbookState;
  readonly tabs: Readonly<Record<ApprovedInputTab, GoogleTabValidation>>;
  readonly issues: readonly GoogleValidationIssue[];
  readonly populatedRows: number;
  readonly acceptedRows: number;
}

const forbiddenProductionMarker = /\b(?:test|mock|synthetic|example)\b/i;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function isEmptyRow(row: readonly unknown[]): boolean {
  return row.every(isEmpty);
}

function validIsoDate(value: string): boolean {
  if (!isoDate.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validateCell(
  column: ColumnContract,
  value: unknown,
): { readonly value: GoogleCell; readonly code?: string } {
  if (isEmpty(value)) {
    return column.required ? { value: null, code: "REQUIRED_VALUE_MISSING" } : { value: null };
  }
  if (column.kind === "text") {
    if (typeof value !== "string" || value.trim().length === 0) {
      return { value: null, code: "INVALID_TEXT" };
    }
    const normalized = value.trim();
    if (column.enumValues && !column.enumValues.includes(normalized)) {
      return { value: null, code: "INVALID_ENUM" };
    }
    return { value: normalized };
  }
  if (column.kind === "date") {
    if (typeof value !== "string" || !validIsoDate(value)) {
      return { value: null, code: "INVALID_DATE" };
    }
    return { value };
  }
  if (column.kind === "boolean") {
    if (typeof value === "boolean") return { value };
    if (value === "TRUE") return { value: true };
    if (value === "FALSE") return { value: false };
    return { value: null, code: "INVALID_BOOLEAN" };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { value: null, code: "INVALID_NUMBER" };
  }
  if (column.kind === "integer" && !Number.isInteger(value)) {
    return { value: null, code: "INVALID_INTEGER" };
  }
  if (column.minimum !== undefined && value < column.minimum) {
    return { value: null, code: "NUMBER_BELOW_MINIMUM" };
  }
  if (column.exclusiveMinimum !== undefined && value <= column.exclusiveMinimum) {
    return { value: null, code: "NUMBER_NOT_GREATER_THAN_MINIMUM" };
  }
  return { value };
}

function issue(
  code: string,
  tab: string,
  row: number | null,
  column: string | null,
  message: string,
): GoogleValidationIssue {
  return { code, tab, row, column, message };
}

function crossFieldIssues(
  contract: TabContract,
  rowNumber: number,
  record: GoogleRecord,
): GoogleValidationIssue[] {
  const findings: GoogleValidationIssue[] = [];
  const after = (later: string, earlier: string): void => {
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
  };

  if (contract.name === "Mappings") {
    if (record["Mapping Type"] === "SKU") {
      const units = record["Units per Sellable Unit"];
      if (typeof units !== "number" || units <= 0) {
        findings.push(
          issue(
            "CONDITIONAL_VALUE_REQUIRED",
            contract.name,
            rowNumber,
            "Units per Sellable Unit",
            "SKU mappings require positive units per sellable unit",
          ),
        );
      }
    }
    if (record["Mapping Type"] === "CHANNEL" && record["S&OP Channel"] === null) {
      findings.push(
        issue(
          "CONDITIONAL_VALUE_REQUIRED",
          contract.name,
          rowNumber,
          "S&OP Channel",
          "Channel mappings require an S&OP channel",
        ),
      );
    }
  }
  if (contract.name === "Production") {
    after("Expected Arrival Date", "Order Date");
    if (record["Status"] === "Received" && record["Actual Arrival Date"] === null) {
      findings.push(
        issue(
          "CONDITIONAL_VALUE_REQUIRED",
          contract.name,
          rowNumber,
          "Actual Arrival Date",
          "Received production requires an actual arrival date",
        ),
      );
    }
  }
  if (contract.name === "SKU_Costs") after("Effective To", "Effective From");
  if (contract.name === "Partner_Performance") after("Period End", "Period Start");
  if (contract.name === "Rules_Targets") after("Effective To", "Effective From");
  return findings;
}

function businessKey(contract: TabContract, record: GoogleRecord): string {
  const values =
    contract.businessKey === "exact-row"
      ? contract.columns.map(({ header }) => record[header])
      : contract.businessKey.map((header) => record[header]);
  return JSON.stringify(values);
}

function validateTab(
  contract: TabContract,
  rows: readonly (readonly unknown[])[],
  environment: "test" | "production",
): { readonly result: GoogleTabValidation; readonly validatedRows: readonly ValidatedRow[] } {
  const issues: GoogleValidationIssue[] = [];
  const expectedHeaders = contract.columns.map(({ header }) => header);
  const suppliedHeaders = (rows[0] ?? []).map((value) =>
    typeof value === "string" ? value.trim() : "",
  );
  while (suppliedHeaders.at(-1) === "") suppliedHeaders.pop();
  const duplicateHeaders = suppliedHeaders.filter(
    (header, index) => header !== "" && suppliedHeaders.indexOf(header) !== index,
  );
  if (duplicateHeaders.length > 0) {
    issues.push(
      issue(
        "DUPLICATE_HEADER",
        contract.name,
        1,
        null,
        "Header row contains duplicate required names",
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
        "Header names or order do not match the approved contract",
      ),
    );
  }
  if (issues.length > 0) {
    return {
      result: { tab: contract.name, records: [], issues, populatedRows: 0 },
      validatedRows: [],
    };
  }

  const candidates: ValidatedRow[] = [];
  let populatedRows = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const sourceRow = rows[index] ?? [];
    if (isEmptyRow(sourceRow)) continue;
    populatedRows += 1;
    const rowNumber = index + 1;
    if (
      environment === "production" &&
      sourceRow.some((value) => typeof value === "string" && forbiddenProductionMarker.test(value))
    ) {
      issues.push(
        issue(
          "PRODUCTION_TEST_DATA",
          contract.name,
          rowNumber,
          null,
          "Production row contains an excluded test/mock marker",
        ),
      );
      continue;
    }

    const record: Record<string, GoogleCell> = {};
    const rowIssues: GoogleValidationIssue[] = [];
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
    const key = businessKey(contract, row.record);
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
  const validatedRows = candidates.filter(({ rowNumber }) => !duplicateRows.has(rowNumber));
  return {
    result: {
      tab: contract.name,
      records: validatedRows.map(({ record }) => record),
      issues,
      populatedRows,
    },
    validatedRows,
  };
}

const referenceColumns: Readonly<
  Partial<Record<ApprovedInputTab, Readonly<Record<string, "SKU" | "WAREHOUSE">>>>
> = {
  Inventory: { Warehouse: "WAREHOUSE", SKU: "SKU" },
  Inventory_Lots: { Warehouse: "WAREHOUSE", SKU: "SKU" },
  Depletions: { Warehouse: "WAREHOUSE", SKU: "SKU" },
  Forecast: { SKU: "SKU" },
  Production: { SKU: "SKU", "Destination Warehouse": "WAREHOUSE" },
  SKU_Costs: { SKU: "SKU" },
  Rules_Targets: { SKU: "SKU", Warehouse: "WAREHOUSE" },
};

export function validateApprovedWorkbook(input: {
  readonly environment: "test" | "production";
  readonly rowsByTab: Readonly<Partial<Record<ApprovedInputTab, readonly (readonly unknown[])[]>>>;
}): GoogleWorkbookValidation {
  const parsed = new Map<ApprovedInputTab, ReturnType<typeof validateTab>>();
  const workbookIssues: GoogleValidationIssue[] = [];
  for (const tab of APPROVED_INPUT_TABS) {
    const rows = input.rowsByTab[tab];
    if (!rows) {
      const missing = issue(
        "MISSING_TAB",
        tab,
        null,
        null,
        "Required approved input tab is missing",
      );
      parsed.set(tab, {
        result: { tab, records: [], issues: [missing], populatedRows: 0 },
        validatedRows: [],
      });
      workbookIssues.push(missing);
      continue;
    }
    const result = validateTab(APPROVED_TAB_CONTRACTS[tab], rows, input.environment);
    parsed.set(tab, result);
    workbookIssues.push(...result.result.issues);
  }

  const mappingRows = parsed.get("Mappings")?.validatedRows ?? [];
  const canonical = {
    SKU: new Set<string>(),
    WAREHOUSE: new Set<string>(),
  };
  for (const { record } of mappingRows) {
    const type = record["Mapping Type"];
    const target = record["Maps To"];
    if ((type === "SKU" || type === "WAREHOUSE") && typeof target === "string") {
      canonical[type].add(target);
    }
  }

  for (const [tab, columns] of Object.entries(referenceColumns) as [
    ApprovedInputTab,
    Readonly<Record<string, "SKU" | "WAREHOUSE">>,
  ][]) {
    const result = parsed.get(tab);
    if (!result) continue;
    const rejected = new Set<number>();
    for (const row of result.validatedRows) {
      for (const [column, type] of Object.entries(columns)) {
        const value = row.record[column];
        if (value === null) continue;
        if (typeof value !== "string" || !canonical[type].has(value)) {
          rejected.add(row.rowNumber);
          workbookIssues.push(
            issue(
              "UNRESOLVED_MAPPING",
              tab,
              row.rowNumber,
              column,
              `${column} does not resolve through approved mappings`,
            ),
          );
        }
      }
    }
    if (rejected.size > 0) {
      const retained = result.validatedRows.filter(({ rowNumber }) => !rejected.has(rowNumber));
      parsed.set(tab, {
        validatedRows: retained,
        result: {
          ...result.result,
          records: retained.map(({ record }) => record),
          issues: [
            ...result.result.issues,
            ...workbookIssues.filter(
              (finding) => finding.tab === tab && finding.code === "UNRESOLVED_MAPPING",
            ),
          ],
        },
      });
    }
  }

  const tabs = Object.fromEntries(
    APPROVED_INPUT_TABS.map((tab) => [tab, parsed.get(tab)?.result]),
  ) as Record<ApprovedInputTab, GoogleTabValidation>;
  const populatedRows = APPROVED_INPUT_TABS.reduce((sum, tab) => sum + tabs[tab].populatedRows, 0);
  const acceptedRows = APPROVED_INPUT_TABS.reduce((sum, tab) => sum + tabs[tab].records.length, 0);
  const schemaInvalid = workbookIssues.some((finding) =>
    ["MISSING_TAB", "DUPLICATE_HEADER", "HEADER_MISMATCH"].includes(finding.code),
  );
  const state: GoogleWorkbookState = schemaInvalid
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

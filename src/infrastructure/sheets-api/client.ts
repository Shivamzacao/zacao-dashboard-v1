import type {
  SheetsDashboardPage,
  SheetsTabDataSource,
  SheetsTabReadResult,
  SheetRecord,
} from "@/src/application/ports/sheets-tabs";
import { sourceStatusSchema, type SourceStatus } from "@/src/domain/contracts";
import { createGoogleAccessTokenProvider } from "@/src/infrastructure/google/auth";
import { GoogleClientError, GoogleReadClient } from "@/src/infrastructure/google/client";
import {
  APPROVED_GOOGLE_FILE_IDS,
  REQUIRED_GOOGLE_READ_SCOPES,
  type GoogleSourceConfiguration,
} from "@/src/infrastructure/google/config";
import {
  MANUAL_TAB_CONTRACTS,
  MANUAL_WORKBOOK_TABS,
  PRODUCTION_SOURCE_STATUS,
  SOURCE_STATUS_COLUMN,
  type ManualColumnContract,
  type ManualWorkbookTab,
} from "@/src/infrastructure/manual-workbook/contracts.generated";

import type { SheetsApiConfiguration } from "./config";

const knownTabs = new Set<string>(MANUAL_WORKBOOK_TABS);
const numericKinds = new Set(["integer", "usd", "decimal", "percent"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const FRESH_MS = 30_000;
const STALE_MS = 900_000;

interface CachedRead {
  readonly tabs: Readonly<Record<string, readonly SheetRecord[]>>;
  readonly exampleTabs: Readonly<Record<string, readonly SheetRecord[]>>;
  readonly warnings: readonly string[];
  readonly fetchedAt: number;
  readonly dataAsOf: string | null;
}

const SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30);
const SERIAL_MIN = 20_000;
const SERIAL_MAX = 80_000;

/**
 * Date cells in the new workbook's hidden tabs are not date-formatted, so Sheets
 * returns the underlying serial number. Convert only inside a plausible calendar
 * window (roughly 1954–2119) so a genuine quantity is never rewritten as a date.
 */
function serialToDateParts(value: unknown): { date: string; time: string } | null {
  const serial = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(serial) || serial < SERIAL_MIN || serial > SERIAL_MAX) return null;
  const whole = Math.floor(serial);
  const date = new Date(SERIAL_EPOCH_MS + whole * 86_400_000).toISOString().slice(0, 10);
  const seconds = Math.round((serial - whole) * 86_400);
  const pad = (part: number) => String(part).padStart(2, "0");
  return {
    date,
    time: `${pad(Math.floor(seconds / 3_600))}:${pad(Math.floor((seconds % 3_600) / 60))}:${pad(seconds % 60)}`,
  };
}

/** Dropdown labels are Title Case in the new workbook; contract enums are snake_case. */
function foldEnumValue(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "_");
}

function normalizeCell(value: unknown, column: ManualColumnContract): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (numericKinds.has(column.kind)) {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (column.kind === "date" || column.kind === "timestamp") {
    const parts = serialToDateParts(value);
    if (parts) return column.kind === "date" ? parts.date : `${parts.date}T${parts.time}Z`;
  }
  // Checkbox columns (is_active) come back as real booleans, not "yes"/"no".
  if (typeof value === "boolean" && column.enumValues) {
    const candidate = value ? "yes" : "no";
    if (column.enumValues.includes(candidate)) return candidate;
  }
  const text = typeof value === "string" ? value.trim() : String(value);
  if (text === "") return null;
  if (column.kind === "date") {
    if (DATE.test(text)) return text;
    const match = US_DATE.exec(text);
    if (!match) return null;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (column.kind === "timestamp" && !TIMESTAMP.test(text)) return null;
  if (column.enumValues && !column.enumValues.includes(text)) {
    const folded = foldEnumValue(text);
    return column.enumValues.find((allowed) => foldEnumValue(allowed) === folded) ?? null;
  }
  return text;
}

/**
 * Statuses that mark a row as real data. Connector-owned rows (Shopify, Klaviyo,
 * backend services) are as authoritative as team-entered production rows.
 */
const PRODUCTION_LIKE_STATUSES = new Set<string>([
  PRODUCTION_SOURCE_STATUS,
  "shopify",
  "klaviyo",
  "backend",
]);

/** Statuses whose rows must never reach the dashboard, drafts included. */
const IGNORED_ROW_STATUSES = new Set<string>(["draft", "invalid", "backend_pending"]);

/**
 * Detects a pre-seeded formula row. Hidden tabs ship ~150 scaffolding rows per
 * tab that already carry a record id, a constant enum such as cost_basis
 * "landed", provenance, and formula cells that resolve to 0 — so "every cell is
 * blank" does not identify them. What they never carry is identifying content:
 * the required dates and amounts. A row missing only *some* of those is a real
 * data-entry problem and still warns.
 */
function isTemplateRow(
  contract: (typeof MANUAL_TAB_CONTRACTS)[ManualWorkbookTab],
  normalized: Readonly<Record<string, string | number | boolean | null>>,
): boolean {
  const businessKey = new Set<string>(contract.businessKey);
  const identifying = contract.columns.filter(
    (column) => column.required && !businessKey.has(column.header) && !column.enumValues,
  );
  if (identifying.length === 0) return false;
  return identifying.every((column) => normalized[column.header] === null);
}

function normalizeRows(tab: ManualWorkbookTab, values: readonly (readonly unknown[])[]) {
  if (values.length === 0) {
    return {
      rows: [] as SheetRecord[],
      exampleRows: [] as SheetRecord[],
      warnings: [] as string[],
    };
  }
  const contract = MANUAL_TAB_CONTRACTS[tab];
  const headers = values[0]?.map((value) => String(value).trim()) ?? [];
  // The production Inventory_Snapshots sheet currently has a blank A1 while
  // the values beneath it are the contract's record identifier.
  if (headers[0] === "" && contract.columns[0]) headers[0] = contract.columns[0].header;
  const headerIndexes = new Map(headers.map((header, index) => [header, index]));
  // A renamed column (week_start -> week_ending) satisfies its contract through
  // an alias, so one contract can serve both workbooks during the migration.
  const columnIndex = (column: ManualColumnContract): number | undefined =>
    headerIndexes.get(column.header) ??
    (column.aliases ?? []).map((alias) => headerIndexes.get(alias)).find((i) => i !== undefined);
  const missing = contract.columns.filter((column) => columnIndex(column) === undefined);
  if (missing.some((column) => column.required)) {
    return {
      rows: [] as SheetRecord[],
      exampleRows: [] as SheetRecord[],
      warnings: [`SHEETS_TAB_INVALID:${tab}`],
    };
  }
  const rows: SheetRecord[] = [];
  const exampleRows: SheetRecord[] = [];
  const warnings: string[] = [];
  const productionBusinessKeys = new Set<string>();
  const exampleBusinessKeys = new Set<string>();
  for (let index = 1; index < values.length; index += 1) {
    const raw = values[index] ?? [];
    if (raw.every((cell) => cell === null || cell === undefined || cell === "")) continue;
    const normalized: Record<string, string | number | boolean | null> = {};
    let valid = true;
    for (const column of contract.columns) {
      const cellIndex = columnIndex(column);
      const value = normalizeCell(cellIndex === undefined ? null : raw[cellIndex], column);
      normalized[column.header] = value;
      if (column.required && value === null) valid = false;
    }
    const rowStatus = normalized[SOURCE_STATUS_COLUMN];
    // Rows the workbook has explicitly disowned never reach validation: they are
    // neither production data nor example fallback, so warning about them would
    // report a problem the team cannot act on.
    if (typeof rowStatus === "string" && IGNORED_ROW_STATUSES.has(rowStatus)) continue;
    if (!valid) {
      // Hidden tabs are pre-filled with ~150 formula-template rows that carry only
      // a record id and provenance constants. They are scaffolding, not bad data.
      if (!isTemplateRow(contract, normalized)) {
        warnings.push(`SHEETS_ROW_INVALID:${tab}:${index + 1}`);
      }
      continue;
    }
    const target =
      rowStatus === null ||
      (typeof rowStatus === "string" && PRODUCTION_LIKE_STATUSES.has(rowStatus))
        ? rows
        : rowStatus === "example"
          ? exampleRows
          : null;
    if (target) {
      const businessKeys = target === rows ? productionBusinessKeys : exampleBusinessKeys;
      const businessKey = JSON.stringify(contract.businessKey.map((key) => normalized[key]));
      if (businessKeys.has(businessKey)) {
        warnings.push(`SHEETS_DUPLICATE_BUSINESS_KEY:${tab}:${index + 1}`);
        continue;
      }
      businessKeys.add(businessKey);
      target.push(normalized);
    }
  }
  return { rows, exampleRows, warnings };
}

function dataAsOf(tabs: Readonly<Record<string, readonly SheetRecord[]>>): string | null {
  const latest = Object.values(tabs)
    .flatMap((rows) => rows)
    .map((row) => row["data_as_of"])
    .filter((value): value is string => typeof value === "string" && DATE.test(value))
    .sort()
    .at(-1);
  return latest ? `${latest}T00:00:00.000Z` : null;
}

function sourceStatus(input: {
  now: string;
  state: SourceStatus["state"];
  dataAsOf: string | null;
  warnings: readonly string[];
  complete: boolean;
  lastSuccessfulAt?: string | null;
}): SourceStatus {
  return sourceStatusSchema.parse({
    source: "google_sheets",
    state: input.state,
    checkedAt: input.now,
    lastSuccessfulAt:
      input.lastSuccessfulAt ??
      (["current", "partial", "no_activity"].includes(input.state) ? input.now : null),
    dataAsOf: input.dataAsOf,
    completeness: input.complete ? "complete" : input.state === "partial" ? "partial" : "unknown",
    warningCodes: input.warnings,
  });
}

function columnName(count: number): string {
  let value = count;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result || "A";
}

export class SheetsApiClient implements SheetsTabDataSource {
  private readonly google: GoogleReadClient;
  private readonly cache = new Map<string, CachedRead>();
  private readonly pending = new Map<string, Promise<CachedRead>>();
  private lastStatus: SourceStatus;

  constructor(
    private readonly configuration: SheetsApiConfiguration,
    dependencies: {
      readonly fetch?: typeof fetch;
      readonly now?: () => Date;
      readonly accessToken?: () => Promise<string>;
    } = {},
  ) {
    this.nowImplementation = dependencies.now ?? (() => new Date());
    const googleConfiguration: GoogleSourceConfiguration = {
      environment: "production",
      activeWorkbookId: configuration.workbookId,
      productionWorkbookId: configuration.workbookId,
      budgetWorkbookId: APPROVED_GOOGLE_FILE_IDS.budgetWorkbook,
      sopWorkbookId: APPROVED_GOOGLE_FILE_IDS.sopWorkbook,
      reportingTimeZone: "America/New_York",
      grantedScopes: [...REQUIRED_GOOGLE_READ_SCOPES],
      requestTimeoutMs: configuration.timeoutMs,
      rowChunkSize: configuration.rowChunkSize,
    };
    this.google = new GoogleReadClient(googleConfiguration, {
      fetch: dependencies.fetch ?? fetch,
      accessToken:
        dependencies.accessToken ??
        createGoogleAccessTokenProvider(configuration.credential, REQUIRED_GOOGLE_READ_SCOPES),
    });
    this.lastStatus = sourceStatus({
      now: this.now().toISOString(),
      state: "no_activity",
      dataAsOf: null,
      warnings: ["SHEETS_NOT_READ_YET"],
      complete: false,
    });
  }

  private readonly nowImplementation: () => Date;
  private now() {
    return this.nowImplementation();
  }
  sourceStatus() {
    return this.lastStatus;
  }

  private async freshRead(requested: readonly ManualWorkbookTab[], signal?: AbortSignal) {
    const metadata = await this.google.readSpreadsheetMetadata(
      this.configuration.workbookId,
      signal,
    );
    const available = new Map(metadata.sheets.map((sheet) => [sheet.title, sheet]));
    const present = requested.filter((tab) => available.has(tab));
    const raw =
      (await this.google.readTabsRows?.({
        spreadsheetId: this.configuration.workbookId,
        sheets: present.map((tab) => ({
          title: tab,
          lastColumn: columnName(MANUAL_TAB_CONTRACTS[tab].columns.length),
        })),
        ...(signal ? { signal } : {}),
      })) ?? {};
    const tabs: Record<string, readonly SheetRecord[]> = {};
    const exampleTabs: Record<string, readonly SheetRecord[]> = {};
    const warnings: string[] = [];
    for (const tab of requested) {
      if (!available.has(tab)) {
        tabs[tab] = [];
        exampleTabs[tab] = [];
        warnings.push(`SHEETS_TAB_MISSING:${tab}`);
        continue;
      }
      const normalized = normalizeRows(tab, raw[tab] ?? []);
      tabs[tab] = normalized.rows;
      exampleTabs[tab] = normalized.exampleRows;
      warnings.push(...normalized.warnings);
    }
    return {
      tabs,
      exampleTabs,
      warnings,
      fetchedAt: this.now().getTime(),
      dataAsOf: dataAsOf(tabs),
    };
  }

  async readPageTabs(
    page: SheetsDashboardPage,
    tabNames: readonly string[],
    signal?: AbortSignal,
  ): Promise<SheetsTabReadResult> {
    const requested = [...new Set(tabNames)].filter((tab): tab is ManualWorkbookTab =>
      knownTabs.has(tab),
    );
    const key = `${page}:${[...requested].sort().join(",")}`;
    const now = this.now();
    const cached = this.cache.get(key);
    let read: CachedRead;
    try {
      if (cached && now.getTime() - cached.fetchedAt < FRESH_MS) read = cached;
      else {
        let request = this.pending.get(key);
        if (!request) {
          request = this.freshRead(requested, signal)
            .then((value) => {
              this.cache.set(key, value);
              return value;
            })
            .finally(() => this.pending.delete(key));
          this.pending.set(key, request);
        }
        read = await request;
      }
      const totalRows = Object.values(read.tabs).reduce((sum, rows) => sum + rows.length, 0);
      const state = read.warnings.length ? "partial" : totalRows ? "current" : "no_activity";
      this.lastStatus = sourceStatus({
        now: now.toISOString(),
        state,
        dataAsOf: read.dataAsOf,
        warnings: read.warnings,
        complete: read.warnings.length === 0,
      });
      return {
        tabs: read.tabs,
        exampleTabs: read.exampleTabs,
        sourceStatus: this.lastStatus,
        warnings: read.warnings,
      };
    } catch (error) {
      if (cached && now.getTime() - cached.fetchedAt <= STALE_MS) {
        const warnings = ["SHEETS_STALE_FALLBACK"];
        this.lastStatus = sourceStatus({
          now: now.toISOString(),
          state: "stale",
          dataAsOf: cached.dataAsOf,
          warnings,
          complete: false,
          lastSuccessfulAt: new Date(cached.fetchedAt).toISOString(),
        });
        return {
          tabs: cached.tabs,
          exampleTabs: cached.exampleTabs,
          sourceStatus: this.lastStatus,
          warnings,
        };
      }
      const invalid = error instanceof GoogleClientError && error.kind === "malformed_response";
      const warning =
        error instanceof GoogleClientError
          ? `SHEETS_GOOGLE_${error.kind.toUpperCase()}`
          : "SHEETS_GOOGLE_UNAVAILABLE";
      this.lastStatus = sourceStatus({
        now: now.toISOString(),
        state: invalid ? "invalid" : "unavailable",
        dataAsOf: null,
        warnings: [warning],
        complete: false,
      });
      throw error;
    }
  }
}

import { z } from "zod";

import type {
  SheetsDashboardPage,
  SheetsTabDataSource,
  SheetsTabReadResult,
} from "@/src/application/ports/sheets-tabs";
import type { ManualStoreRecord } from "@/src/application/ports/manual-workbook";
import { sourceStatusSchema, type SourceStatus } from "@/src/domain/contracts";
import {
  MANUAL_TAB_CONTRACTS,
  MANUAL_WORKBOOK_TABS,
  PRODUCTION_SOURCE_STATUS,
  SOURCE_STATUS_COLUMN,
  type ManualColumnContract,
  type ManualWorkbookTab,
} from "@/src/infrastructure/manual-workbook/contracts.generated";

import type { SheetsApiConfiguration } from "./config";

const rowSchema = z.record(z.string(), z.unknown());
const envelopeSchema = z
  .object({ success: z.boolean(), data: z.array(rowSchema), offset: z.unknown().optional() })
  .passthrough();
const aggregateSchema = z.record(z.string(), z.unknown());
const knownTabs = new Set<string>(MANUAL_WORKBOOK_TABS);
const numericKinds = new Set(["integer", "usd", "decimal", "percent"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/;

interface CachedWorkbook {
  readonly tabs: Readonly<Record<string, readonly ManualStoreRecord[]>>;
  readonly warnings: readonly string[];
  readonly fetchedAt: number;
  readonly dataAsOf: string | null;
}

export class SheetsApiError extends Error {
  constructor(readonly kind: "timeout" | "transport" | "http" | "invalid") {
    super(`Sheets API ${kind}`);
    this.name = "SheetsApiError";
  }
}

function normalizeCell(value: unknown, column: ManualColumnContract): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (numericKinds.has(column.kind)) {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : null;
  }
  const text = typeof value === "string" ? value.trim() : String(value);
  if (text === "") return null;
  if (column.kind === "date" && !DATE.test(text)) return null;
  if (column.kind === "timestamp" && !TIMESTAMP.test(text)) return null;
  if (column.enumValues && !column.enumValues.includes(text)) return null;
  return text;
}

function normalizeTab(tab: ManualWorkbookTab, value: unknown) {
  const envelope = envelopeSchema.safeParse(value);
  if (!envelope.success || !envelope.data.success) {
    return { rows: [] as ManualStoreRecord[], warnings: [`SHEETS_TAB_INVALID:${tab}`] };
  }
  const contract = MANUAL_TAB_CONTRACTS[tab];
  const rows: ManualStoreRecord[] = [];
  const warnings: string[] = [];
  for (const [index, raw] of envelope.data.data.entries()) {
    const normalized: Record<string, string | number | boolean | null> = {};
    let valid = true;
    for (const column of contract.columns) {
      const value = normalizeCell(raw[column.header], column);
      normalized[column.header] = value;
      if (column.required && value === null) valid = false;
    }
    if (!valid) {
      warnings.push(`SHEETS_ROW_INVALID:${tab}:${index + 2}`);
      continue;
    }
    if (
      normalized[SOURCE_STATUS_COLUMN] === null ||
      normalized[SOURCE_STATUS_COLUMN] === PRODUCTION_SOURCE_STATUS
    ) {
      rows.push(normalized);
    }
  }
  return { rows, warnings };
}

function dataAsOf(tabs: Readonly<Record<string, readonly ManualStoreRecord[]>>): string | null {
  const latest = Object.values(tabs)
    .flatMap((rows) => rows)
    .map((row) => row["data_as_of"])
    .filter((value): value is string => typeof value === "string" && DATE.test(value))
    .sort()
    .at(-1);
  return latest ? `${latest}T00:00:00.000Z` : null;
}

function status(input: {
  now: string;
  state: SourceStatus["state"];
  dataAsOf: string | null;
  warnings: readonly string[];
  complete: boolean;
}): SourceStatus {
  return sourceStatusSchema.parse({
    source: "google_sheets",
    state: input.state,
    checkedAt: input.now,
    lastSuccessfulAt: ["current", "partial", "no_activity", "stale"].includes(input.state)
      ? input.now
      : null,
    dataAsOf: input.dataAsOf,
    completeness: input.complete ? "complete" : input.state === "partial" ? "partial" : "unknown",
    warningCodes: input.warnings,
  });
}

export class SheetsApiClient implements SheetsTabDataSource {
  private readonly cacheByUrl = new Map<string, CachedWorkbook>();
  private readonly pendingByUrl = new Map<string, Promise<CachedWorkbook>>();
  private lastStatus: SourceStatus;

  constructor(
    private readonly configuration: SheetsApiConfiguration,
    private readonly dependencies: {
      readonly fetch?: typeof fetch;
      readonly now?: () => Date;
    } = {},
  ) {
    this.lastStatus = status({
      now: this.now().toISOString(),
      state: "no_activity",
      dataAsOf: null,
      warnings: ["SHEETS_NOT_READ_YET"],
      complete: false,
    });
  }

  private now(): Date {
    return this.dependencies.now?.() ?? new Date();
  }

  sourceStatus(): SourceStatus {
    return this.lastStatus;
  }

  private async request(url: string, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.configuration.timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await (this.dependencies.fetch ?? fetch)(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new SheetsApiError("http");
      try {
        return await response.json();
      } catch {
        throw new SheetsApiError("invalid");
      }
    } catch (error) {
      if (error instanceof SheetsApiError) throw error;
      if (controller.signal.aborted) throw new SheetsApiError("timeout");
      throw new SheetsApiError("transport");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  private normalizeAggregate(payload: unknown): CachedWorkbook {
    const parsed = aggregateSchema.safeParse(payload);
    if (!parsed.success) throw new SheetsApiError("invalid");
    const tabs: Record<string, readonly ManualStoreRecord[]> = {};
    const warnings: string[] = [];
    for (const [tab, value] of Object.entries(parsed.data)) {
      if (!knownTabs.has(tab)) continue;
      const normalized = normalizeTab(tab as ManualWorkbookTab, value);
      tabs[tab] = normalized.rows;
      warnings.push(...normalized.warnings);
    }
    const fetchedAt = this.now().getTime();
    return { tabs, warnings, fetchedAt, dataAsOf: dataAsOf(tabs) };
  }

  private async workbook(url: string, signal?: AbortSignal): Promise<CachedWorkbook> {
    const now = this.now().getTime();
    const cached = this.cacheByUrl.get(url);
    if (cached && now - cached.fetchedAt < 300_000) return cached;
    const existing = this.pendingByUrl.get(url);
    if (existing) return existing;
    const pending = this.request(url, signal)
      .then((payload) => {
        const normalized = this.normalizeAggregate(payload);
        this.cacheByUrl.set(url, normalized);
        return normalized;
      })
      .finally(() => {
        this.pendingByUrl.delete(url);
      });
    this.pendingByUrl.set(url, pending);
    return pending;
  }

  private async readDedicatedTab(tab: ManualWorkbookTab, url: string, signal?: AbortSignal) {
    const payload = await this.request(url, signal);
    const aggregate = aggregateSchema.safeParse(payload);
    const envelope = aggregate.success && tab in aggregate.data ? aggregate.data[tab] : payload;
    return normalizeTab(tab, envelope);
  }

  async readPageTabs(
    page: SheetsDashboardPage,
    tabNames: readonly string[],
    signal?: AbortSignal,
  ): Promise<SheetsTabReadResult> {
    const requested = [...new Set(tabNames)].filter((tab): tab is ManualWorkbookTab =>
      knownTabs.has(tab),
    );
    const dedicated = requested.filter((tab) => this.configuration.tabUrls[tab]);
    const fallback = requested.filter((tab) => !this.configuration.tabUrls[tab]);
    const pageUrl = this.configuration.pageUrls[page] ?? this.configuration.aggregateUrl;
    try {
      if (fallback.length && !pageUrl) throw new SheetsApiError("transport");
      const [pageWorkbook, dedicatedResults] = await Promise.all([
        fallback.length && pageUrl ? this.workbook(pageUrl, signal) : Promise.resolve(null),
        Promise.all(
          dedicated.map(async (tab) => ({
            tab,
            result: await this.readDedicatedTab(
              tab,
              this.configuration.tabUrls[tab] as string,
              signal,
            ),
          })),
        ),
      ]);
      const tabs: Record<string, readonly ManualStoreRecord[]> = {};
      const warnings = [...(pageWorkbook?.warnings ?? [])];
      for (const tab of fallback) {
        if (!(tab in (pageWorkbook?.tabs ?? {}))) warnings.push(`SHEETS_TAB_MISSING:${tab}`);
        tabs[tab] = pageWorkbook?.tabs[tab] ?? [];
      }
      for (const { tab, result } of dedicatedResults) {
        tabs[tab] = result.rows;
        warnings.push(...result.warnings);
      }
      const relevantWarnings = [
        ...new Set(
          warnings.filter((warning) => requested.some((tab) => warning.includes(`:${tab}`))),
        ),
      ];
      const totalRows = Object.values(tabs).reduce((sum, rows) => sum + rows.length, 0);
      const state = relevantWarnings.length ? "partial" : totalRows ? "current" : "no_activity";
      this.lastStatus = status({
        now: this.now().toISOString(),
        state,
        dataAsOf: dataAsOf(tabs) ?? pageWorkbook?.dataAsOf ?? null,
        warnings: relevantWarnings,
        complete: relevantWarnings.length === 0,
      });
      return { tabs, sourceStatus: this.lastStatus, warnings: relevantWarnings };
    } catch (error) {
      const now = this.now();
      const cached = pageUrl ? this.cacheByUrl.get(pageUrl) : null;
      if (cached && now.getTime() - cached.fetchedAt <= 900_000) {
        const tabs = Object.fromEntries(requested.map((tab) => [tab, cached.tabs[tab] ?? []]));
        this.lastStatus = status({
          now: now.toISOString(),
          state: "stale",
          dataAsOf: cached.dataAsOf,
          warnings: ["SHEETS_STALE_FALLBACK"],
          complete: false,
        });
        return { tabs, sourceStatus: this.lastStatus, warnings: ["SHEETS_STALE_FALLBACK"] };
      }
      const kind = error instanceof SheetsApiError ? error.kind : "transport";
      this.lastStatus = status({
        now: now.toISOString(),
        state: kind === "invalid" ? "invalid" : "unavailable",
        dataAsOf: null,
        warnings: [`SHEETS_API_${kind.toUpperCase()}`],
        complete: false,
      });
      throw error;
    }
  }
}

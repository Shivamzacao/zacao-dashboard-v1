import type { CsvRow } from "@/src/application/exports";
import { safeCsvFilename, serializeCsv } from "@/src/application/exports";
import type { OrchestratedDashboardResult } from "@/src/application/orchestration";
import type { DashboardPageViewModel } from "@/src/application/view-models";
import type {
  CacheMetadata,
  DashboardFilters,
  Readiness,
  SourceStatus,
} from "@/src/domain/contracts";

import { drilldownDefinition } from "./catalog";
import type { DrilldownApiResponse, FilterOptions } from "./contracts";
import { ApiQueryError, type DrilldownQuery } from "./query";
import type { BackendApiRuntime } from "./runtime";

type SafeRow = DrilldownApiResponse["data"]["rows"][number];

function overallCache(result: OrchestratedDashboardResult, now: string): CacheMetadata {
  const values = result.cache.map(({ cache }) => cache);
  const priority = ["stale", "miss", "bypass", "hit"] as const;
  const state =
    priority.find((candidate) => values.some((cache) => cache.state === candidate)) ?? "bypass";
  const generatedAt =
    values
      .map(({ generatedAt }) => generatedAt)
      .sort()
      .at(0) ?? now;
  const expiries = values.flatMap(({ expiresAt }) => (expiresAt ? [expiresAt] : [])).sort();
  return { state, generatedAt, expiresAt: expiries.at(0) ?? null };
}

function cursor(dataset: string, offset: number): string {
  return Buffer.from(JSON.stringify({ dataset, offset }), "utf8").toString("base64url");
}

function offsetFromCursor(value: string | null, dataset: string): number {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) throw new Error("invalid");
    const object = parsed as Record<string, unknown>;
    if (
      object["dataset"] !== dataset ||
      !Number.isInteger(object["offset"]) ||
      Number(object["offset"]) < 0
    )
      throw new Error("invalid");
    return Number(object["offset"]);
  } catch {
    throw new ApiQueryError("Invalid pagination cursor", ["cursor"]);
  }
}

function comparison(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

function findRows(page: DashboardPageViewModel, metricKey: string): readonly SafeRow[] {
  return page.tables.find(({ metric }) => metric.key === metricKey)?.rows ?? [];
}

function readinessFor(page: DashboardPageViewModel, metricKey: string): Readiness {
  return (
    page.metrics.find(({ key }) => key === metricKey)?.readiness ?? {
      state: "not_configured",
      message: "The dataset is not available for this request.",
      warningCodes: ["DATASET_NOT_CONFIGURED"],
    }
  );
}

export class BackendApiService {
  constructor(
    private readonly runtime: BackendApiRuntime,
    private readonly now: () => Date,
  ) {}

  get environment() {
    return this.runtime.environment;
  }

  get supportedFilters(): FilterOptions {
    return this.runtime.supportedFilters;
  }

  async dashboard(
    section: Parameters<BackendApiRuntime["loadDashboard"]>[0],
    filters: DashboardFilters,
  ) {
    const result = await this.runtime.loadDashboard(section, filters);
    return {
      data: { page: result.page, supportedFilters: this.supportedFilters },
      cache: overallCache(result, this.now().toISOString()),
      sources: result.page.sources,
    };
  }

  async drilldown(dataset: string, query: DrilldownQuery) {
    const startedAt = performance.now();
    const definition = drilldownDefinition(dataset);
    if (!definition) throw new ApiQueryError("Unsupported drill-down dataset", ["dataset"]);
    if (definition.sourceLimited) {
      const sources = await this.runtime.sourceStatuses();
      return {
        data: {
          dataset,
          columns: [],
          rows: [],
          pagination: { nextCursor: null, hasNextPage: false },
          readiness: {
            state: "partial" as const,
            message: "Detailed Shopify history is incomplete for this drill-down.",
            warningCodes: ["SOURCE_LIMITED", "DETAILED_HISTORY_INCOMPLETE"],
          },
          sources: sources.filter(({ source }) => source === "shopify"),
        },
        cache: { state: "bypass" as const, generatedAt: this.now().toISOString(), expiresAt: null },
        sources,
      };
    }
    const result = await this.runtime.loadDashboard(definition.section, query.filters);
    const rows = [...findRows(result.page, definition.metricKey)].sort((left, right) => {
      const value = comparison(left[query.sortField], right[query.sortField]);
      return query.sortDirection === "asc" ? value : -value;
    });
    const start = offsetFromCursor(query.cursor, dataset);
    const selected = rows
      .slice(start, start + query.limit)
      .map((row) => Object.fromEntries(query.fields.map((field) => [field, row[field] ?? null])));
    const nextOffset = start + selected.length;
    console.info("Dashboard drill-down page", {
      dataset,
      rawRowCount: rows.length,
      returnedRowCount: selected.length,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return {
      data: {
        dataset,
        columns: [...query.fields],
        rows: selected,
        pagination: {
          nextCursor: nextOffset < rows.length ? cursor(dataset, nextOffset) : null,
          hasNextPage: nextOffset < rows.length,
        },
        readiness: readinessFor(result.page, definition.metricKey),
        sources: result.page.sources,
      },
      cache: overallCache(result, this.now().toISOString()),
      sources: result.page.sources,
    };
  }

  async exportCsv(
    dataset: string,
    query: DrilldownQuery,
  ): Promise<{ body: string; filename: string; sources: readonly SourceStatus[] }> {
    const definition = drilldownDefinition(dataset);
    if (!definition?.exportable) throw new ApiQueryError("Unsupported export dataset", ["dataset"]);
    const result = await this.runtime.loadDashboard(definition.section, query.filters);
    const rows = [...findRows(result.page, definition.metricKey)].sort((left, right) => {
      const value = comparison(left[query.sortField], right[query.sortField]);
      return query.sortDirection === "asc" ? value : -value;
    });
    const boundedRows = rows
      .slice(0, Math.min(query.limit, 100))
      .map(
        (row) =>
          Object.fromEntries(query.fields.map((field) => [field, row[field] ?? null])) as CsvRow,
      );
    return {
      body: serializeCsv(query.fields, boundedRows),
      filename: safeCsvFilename(dataset, query.filters.startDate, query.filters.endDate),
      sources: result.page.sources,
    };
  }

  async sourceStatuses(): Promise<readonly SourceStatus[]> {
    return this.runtime.sourceStatuses();
  }
}

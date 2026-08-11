import { z } from "zod";

import { dashboardFiltersSchema, type DashboardFilters } from "@/src/domain/contracts";
import { normalizeDashboardFilters } from "@/src/domain/utilities/filters";

import type { FilterOptions } from "./contracts";
import type { DrilldownDefinition } from "./catalog";

export class ApiQueryError extends Error {
  constructor(
    message: string,
    readonly path: readonly (string | number)[] = [],
  ) {
    super(message);
  }
}

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 ._:/-]*$/);

function assertOnly(search: URLSearchParams, allowed: readonly string[]): void {
  const allowlist = new Set(allowed);
  for (const key of search.keys()) {
    if (!allowlist.has(key)) throw new ApiQueryError(`Unsupported query parameter: ${key}`, [key]);
  }
}

function list(search: URLSearchParams, key: string): string[] {
  const raw = search.get(key);
  if (!raw) return [];
  const values = raw.split(",").map((value) => identifierSchema.parse(value));
  return [...new Set(values)];
}

function assertKnown(values: readonly string[], supported: readonly string[], key: string): void {
  const allowed = new Set(supported);
  const unsupported = values.filter((value) => !allowed.has(value));
  if (unsupported.length > 0)
    throw new ApiQueryError(`Unsupported ${key}: ${unsupported.join(", ")}`, [key]);
}

function daySpan(start: string, end: string): number {
  return (
    Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
  );
}

export function parseDashboardFilters(
  search: URLSearchParams,
  supported: FilterOptions,
): DashboardFilters {
  assertOnly(search, ["start", "end", "comparison", "channels", "skus", "locations"]);
  const startDate = search.get("start");
  const endDate = search.get("end");
  if (!startDate || !endDate) throw new ApiQueryError("start and end are required", ["start"]);
  const filters = normalizeDashboardFilters(
    dashboardFiltersSchema.parse({
      startDate,
      endDate,
      comparison: search.get("comparison") ?? "none",
      channels: list(search, "channels"),
      productSkus: list(search, "skus"),
      locations: list(search, "locations"),
    }),
  );
  if (daySpan(filters.startDate, filters.endDate) > 366)
    throw new ApiQueryError("Date range cannot exceed 366 days", ["end"]);
  if (!supported.comparisons.includes(filters.comparison))
    throw new ApiQueryError("Unsupported comparison", ["comparison"]);
  assertKnown(filters.channels, supported.channels, "channels");
  assertKnown(filters.productSkus, supported.productSkus, "skus");
  assertKnown(filters.locations, supported.locations, "locations");
  return filters;
}

export interface DrilldownQuery {
  readonly filters: DashboardFilters;
  readonly limit: number;
  readonly cursor: string | null;
  readonly sortField: string;
  readonly sortDirection: "asc" | "desc";
  readonly fields: readonly string[];
}

export function parseDrilldownQuery(
  search: URLSearchParams,
  supported: FilterOptions,
  definition: DrilldownDefinition,
): DrilldownQuery {
  assertOnly(search, [
    "start",
    "end",
    "comparison",
    "channels",
    "skus",
    "locations",
    "limit",
    "cursor",
    "sort",
    "fields",
  ]);
  const base = new URLSearchParams(search);
  for (const key of ["limit", "cursor", "sort", "fields"]) base.delete(key);
  const filters = parseDashboardFilters(base, supported);
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(search.get("limit") ?? "50");
  const cursor = search.get("cursor");
  if (cursor && cursor.length > 500) throw new ApiQueryError("Cursor is too long", ["cursor"]);
  if (definition.sourceLimited || definition.implementationPending) {
    if (search.has("sort") || search.has("fields"))
      throw new ApiQueryError("Sorting and fields are unavailable for this pending dataset", [
        "sort",
      ]);
    return {
      filters,
      limit,
      cursor,
      sortField: "_none",
      sortDirection: "asc",
      fields: [],
    };
  }
  const rawSort = search.get("sort") ?? `${definition.sortFields[0] ?? "_none"}:asc`;
  const match = /^([^:]+):(asc|desc)$/.exec(rawSort);
  if (!match || !definition.sortFields.includes(match[1] ?? ""))
    throw new ApiQueryError("Unsupported sort", ["sort"]);
  const fields = search.get("fields") ? list(search, "fields") : [...definition.fields];
  assertKnown(fields, definition.fields, "fields");
  return {
    filters,
    limit,
    cursor,
    sortField: match[1] as string,
    sortDirection: match[2] as "asc" | "desc",
    fields,
  };
}

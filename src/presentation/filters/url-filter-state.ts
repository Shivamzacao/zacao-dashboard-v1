import { parseDashboardFilters } from "@/src/application/api";

import type { FilterOptions } from "@/src/application/api";
import type { ComparisonMode, DashboardFilters, IsoDate } from "@/src/domain/contracts";

export type DateRangePreset = "last_30_days" | "last_90_days" | "year_to_date" | "last_12_months";

export interface FrontendFilterState {
  readonly filters: DashboardFilters;
  readonly query: string;
  readonly preset: DateRangePreset | "custom";
  readonly recovered: boolean;
}

const allowedKeys = new Set(["start", "end", "comparison", "channels", "skus", "locations"]);
const comparisons: readonly ComparisonMode[] = ["none", "previous_period", "previous_year"];

function formatUtcDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10) as IsoDate;
}

function shiftDays(date: IsoDate, days: number): IsoDate {
  const shifted = new Date(date + "T00:00:00Z");
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return formatUtcDate(shifted);
}

function firstDayOfYear(date: IsoDate): IsoDate {
  return (date.slice(0, 4) + "-01-01") as IsoDate;
}

function validIsoDate(value: string | null): value is IsoDate {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.valueOf()) && formatUtcDate(parsed) === value;
}

function daySpan(start: IsoDate, end: IsoDate): number {
  return (
    Math.floor((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86_400_000) + 1
  );
}

export function dateRangeForPreset(
  preset: DateRangePreset,
  today: IsoDate,
): Readonly<{ startDate: IsoDate; endDate: IsoDate }> {
  if (preset === "last_30_days") return { startDate: shiftDays(today, -29), endDate: today };
  if (preset === "last_90_days") return { startDate: shiftDays(today, -89), endDate: today };
  if (preset === "year_to_date") return { startDate: firstDayOfYear(today), endDate: today };
  return { startDate: shiftDays(today, -364), endDate: today };
}

function matchingPreset(
  startDate: IsoDate,
  endDate: IsoDate,
  today: IsoDate,
): DateRangePreset | "custom" {
  const presets: readonly DateRangePreset[] = [
    "last_30_days",
    "last_90_days",
    "year_to_date",
    "last_12_months",
  ];
  return (
    presets.find((preset) => {
      const range = dateRangeForPreset(preset, today);
      return range.startDate === startDate && range.endDate === endDate;
    }) ?? "custom"
  );
}

function supportedList(
  search: URLSearchParams,
  key: string,
  supported: readonly string[],
): string[] {
  const allowed = new Set(supported);
  return [
    ...new Set((search.get(key) ?? "").split(",").filter((value) => allowed.has(value))),
  ].sort((left, right) => left.localeCompare(right));
}

export function serializeDashboardFilters(filters: DashboardFilters): string {
  const search = new URLSearchParams();
  search.set("start", filters.startDate);
  search.set("end", filters.endDate);
  search.set("comparison", filters.comparison);
  if (filters.channels.length > 0) search.set("channels", filters.channels.join(","));
  if (filters.productSkus.length > 0) search.set("skus", filters.productSkus.join(","));
  if (filters.locations.length > 0) search.set("locations", filters.locations.join(","));
  return search.toString();
}

export function parseFrontendFilterState(
  search: URLSearchParams,
  supported: FilterOptions,
  today: IsoDate,
): FrontendFilterState {
  const fallback = dateRangeForPreset("last_12_months", today);
  const requestedStart = search.get("start");
  const requestedEnd = search.get("end");
  const validRange =
    validIsoDate(requestedStart) &&
    validIsoDate(requestedEnd) &&
    requestedStart <= requestedEnd &&
    daySpan(requestedStart, requestedEnd) <= 366;
  const requestedComparison = search.get("comparison");
  const comparison =
    requestedComparison &&
    comparisons.includes(requestedComparison as ComparisonMode) &&
    supported.comparisons.includes(requestedComparison as ComparisonMode)
      ? (requestedComparison as ComparisonMode)
      : "none";

  const canonical = new URLSearchParams();
  canonical.set("start", validRange ? requestedStart : fallback.startDate);
  canonical.set("end", validRange ? requestedEnd : fallback.endDate);
  canonical.set("comparison", comparison);
  const channels = supportedList(search, "channels", supported.channels);
  const productSkus = supportedList(search, "skus", supported.productSkus);
  const locations = supportedList(search, "locations", supported.locations);
  if (channels.length > 0) canonical.set("channels", channels.join(","));
  if (productSkus.length > 0) canonical.set("skus", productSkus.join(","));
  if (locations.length > 0) canonical.set("locations", locations.join(","));

  const filters = parseDashboardFilters(canonical, supported);
  const original = new URLSearchParams(search);
  const unknownKey = [...original.keys()].some((key) => !allowedKeys.has(key));

  return {
    filters,
    query: serializeDashboardFilters(filters),
    preset: matchingPreset(filters.startDate, filters.endDate, today),
    recovered: unknownKey || original.toString() !== canonical.toString(),
  };
}

export function updateFilterState(
  state: FrontendFilterState,
  patch: Partial<DashboardFilters>,
  supported: FilterOptions,
  today: IsoDate,
): FrontendFilterState {
  const candidate = {
    ...state.filters,
    ...patch,
  };
  return parseFrontendFilterState(
    new URLSearchParams(serializeDashboardFilters(candidate)),
    supported,
    today,
  );
}

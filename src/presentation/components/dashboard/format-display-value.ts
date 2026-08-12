import type { MetricDisplayValue } from "@/src/application/view-models/metrics";
import type { ChartValueFormat } from "./display-contracts";

export type DisplayFormatMode = "compact" | "full";

const COMPACT_THRESHOLD = 1_000;
const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const quantityFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const signedPercentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const fullUsdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compactUsdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "America/New_York",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

function usesCompactNotation(value: number, mode: DisplayFormatMode): boolean {
  return mode === "compact" && Math.abs(value) >= COMPACT_THRESHOLD;
}

export function formatCount(value: number, mode: DisplayFormatMode = "full"): string {
  return usesCompactNotation(value, mode)
    ? compactNumberFormatter.format(value)
    : integerFormatter.format(value);
}

export function formatQuantity(value: number, mode: DisplayFormatMode = "full"): string {
  return usesCompactNotation(value, mode)
    ? compactNumberFormatter.format(value)
    : quantityFormatter.format(value);
}

export function formatUsd(value: number, mode: DisplayFormatMode = "full"): string {
  return usesCompactNotation(value, mode)
    ? compactUsdFormatter.format(value)
    : fullUsdFormatter.format(value);
}

export function formatPercent(value: number, signed = false): string {
  return `${(signed ? signedPercentFormatter : percentFormatter).format(value)}%`;
}

export function formatChartValue(
  value: number,
  format: ChartValueFormat,
  mode: DisplayFormatMode,
): string {
  if (format === "money") return formatUsd(value, mode);
  if (format === "percent") return formatPercent(value);
  if (format === "quantity") return formatQuantity(value, mode);
  return formatCount(value, mode);
}

export function formatDate(value: string | Date): string {
  return dateFormatter.format(
    typeof value === "string" ? new Date(`${value.slice(0, 10)}T12:00:00Z`) : value,
  );
}

export function formatMonth(value: string): string {
  return monthFormatter.format(new Date(`${value}-01T12:00:00Z`));
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDisplayValue(
  value: MetricDisplayValue | null,
  mode: DisplayFormatMode = "compact",
): string {
  if (value === null) return "Unavailable";
  switch (value.kind) {
    case "money":
      return formatUsd(value.value.minorUnits / 100, mode);
    case "rate_basis_points":
      return formatPercent(value.value / 100);
    case "count":
      return formatCount(value.value, mode);
    case "quantity":
      return formatQuantity(value.value, mode);
    case "duration_seconds": {
      const minutes = Math.floor(value.value / 60);
      const seconds = value.value % 60;
      return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }
    case "date":
      return formatDate(value.value);
    case "status":
      return value.value;
  }
}

export function fullDisplayValue(value: MetricDisplayValue | null): string {
  if (value === null) return "Data unavailable";
  return formatDisplayValue(value, "full");
}

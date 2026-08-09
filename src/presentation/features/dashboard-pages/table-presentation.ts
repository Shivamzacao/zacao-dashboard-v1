import type { DashboardTableColumn } from "@/src/presentation/components/dashboard/data-table.client";

import type { DisplayTableRow } from "./display-data";

/**
 * Drill-down rows arrive keyed by the field names the API contract uses
 * (`priceMinorUnits`, `deliveryRateBasisPoints`, `poNumber`). Those names are
 * a storage detail; this module turns them into the headers and cell values a
 * reader can act on, without touching the underlying data the CSV export and
 * the API keep emitting verbatim.
 */

/** Tokens that read as initialisms rather than words. */
const INITIALISMS = new Set(["cac", "fefo", "id", "ltv", "po", "roas", "sku", "url"]);

/** Suffixes that declare a unit; the unit moves into the formatting, not the header. */
const UNIT_SUFFIXES = ["MinorUnits", "BasisPoints"] as const;

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const dayFormatter = new Intl.DateTimeFormat("en-US", {
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

type CellFormat = "money" | "percent" | "date" | "plain";

/** A value that identifies a record to a machine and nothing to a reader. */
const OPAQUE_URI = /^(?:gid:\/\/|https?:\/\/)/;
const ISO_DAY = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;
/** `ACTIVE`, `IN_TRANSIT` — provider enums shouted in caps. */
const ENUM_TOKEN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

function stripUnitSuffix(key: string): string {
  const suffix = UNIT_SUFFIXES.find((candidate) => key.endsWith(candidate));
  return suffix ? key.slice(0, -suffix.length) : key;
}

export function columnLabel(key: string): string {
  const words = stripUnitSuffix(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return key;
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (INITIALISMS.has(lower)) return lower.toUpperCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

function cellFormat(key: string): CellFormat {
  if (key.endsWith("MinorUnits")) return "money";
  if (key.endsWith("BasisPoints")) return "percent";
  if (/(^|[a-z])date$/i.test(key) || key === "period") return "date";
  return "plain";
}

function formatDate(value: string): string {
  const month = ISO_MONTH.exec(value);
  if (month) return monthFormatter.format(new Date(`${value}-01T12:00:00Z`));
  const day = ISO_DAY.exec(value);
  return day ? dayFormatter.format(new Date(`${day[1]}T12:00:00Z`)) : value;
}

export function formatCell(key: string, value: DisplayTableRow[string]): string {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const format = cellFormat(key);
  if (typeof value === "number") {
    if (format === "money") return usdFormatter.format(value / 100);
    if (format === "percent") return `${percentFormatter.format(value / 100)}%`;
    return numberFormatter.format(value);
  }
  if (format === "date") return formatDate(value);
  if (ENUM_TOKEN.test(value)) {
    const words = value.replace(/_/g, " ").toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return value;
}

/**
 * True when every value a column carries is an opaque URI. Such a column is
 * pure noise on screen: it cannot be read, compared, or sorted meaningfully.
 */
function isOpaqueColumn(key: string, rows: readonly DisplayTableRow[]): boolean {
  const present = rows.map((row) => row[key]).filter((value) => value !== null && value !== "");
  return (
    present.length > 0 &&
    present.every((value) => typeof value === "string" && OPAQUE_URI.test(value))
  );
}

/** Reader-facing columns for a drill-down dataset, in the row's own field order. */
export function describeColumns(
  rows: readonly DisplayTableRow[],
): readonly DashboardTableColumn<DisplayTableRow>[] {
  const first = rows[0];
  if (!first) return [];
  return Object.keys(first)
    .filter((key) => !isOpaqueColumn(key, rows))
    .map((key) => ({
      key,
      label: columnLabel(key),
      sortable: true,
      // Sorting still runs on the raw accessor value, so money and rates order
      // numerically even though the cell renders formatted.
      numeric: typeof first[key] === "number",
      render: (value) => formatCell(key, value),
    }));
}

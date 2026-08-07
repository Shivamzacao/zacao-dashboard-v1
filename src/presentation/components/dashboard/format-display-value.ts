import type { MetricDisplayValue } from "@/src/application/view-models/metrics";

const countFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

function formatNumber(value: number): string {
  return Math.abs(value) >= 1_000_000
    ? compactFormatter.format(value)
    : countFormatter.format(value);
}

export function formatDisplayValue(value: MetricDisplayValue | null): string {
  if (value === null) return "Unavailable";
  switch (value.kind) {
    case "money":
      return usdFormatter.format(value.value.minorUnits / 100);
    case "rate_basis_points":
      return `${countFormatter.format(value.value / 100)}%`;
    case "count":
    case "quantity":
      return formatNumber(value.value);
    case "duration_seconds": {
      const minutes = Math.floor(value.value / 60);
      const seconds = value.value % 60;
      return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }
    case "date":
      return dateFormatter.format(new Date(`${value.value}T12:00:00Z`));
    case "status":
      return value.value;
  }
}

export function fullDisplayValue(value: MetricDisplayValue | null): string {
  if (value === null) return "Data unavailable";
  if (value.kind === "money") return usdFormatter.format(value.value.minorUnits / 100);
  return formatDisplayValue(value);
}

import { drilldownCatalog } from "@/src/application/api/catalog";
import type {
  DashboardPageViewModel,
  MetricDisplayValue,
  MetricViewModel,
} from "@/src/application/view-models";
import type { SourceStatus } from "@/src/domain/contracts";
import type {
  ChartDatum,
  ChartValueFormat,
  DisplayComparison,
  DisplayState,
  SourceIndicatorModel,
} from "@/src/presentation/components/dashboard/display-contracts";

import type { DashboardPageDisplayData, DisplayTableRow } from "./display-data";

const SOURCE_LABELS: Readonly<Record<SourceStatus["source"], string>> = {
  shopify: "Shopify",
  klaviyo: "Klaviyo",
  google_sheets: "Google Sheets",
  google_drive: "Google Drive",
};

const drilldownDatasetByMetricKey = new Map(
  drilldownCatalog.map((definition) => [definition.metricKey, definition.dataset]),
);

export const CATEGORICAL_CHART_LIMIT = 8;
export const TIME_SERIES_CHART_LIMIT = 366;

/** Deterministic top-N projection used by both the visual and accessible chart. */
export function summarizeCategoricalChartData(
  data: readonly ChartDatum[],
  limit = CATEGORICAL_CHART_LIMIT,
): readonly ChartDatum[] {
  if (data.length <= limit) return data;
  const ranked = [...data].sort(
    (left, right) =>
      (right.value ?? Number.NEGATIVE_INFINITY) - (left.value ?? Number.NEGATIVE_INFINITY) ||
      left.key.localeCompare(right.key),
  );
  const shown = ranked.slice(0, limit);
  const rest = ranked.slice(limit);
  return [
    ...shown,
    {
      key: "__other__",
      label: `Other (${rest.length})`,
      value: rest.reduce((total, item) => total + (item.value ?? 0), 0),
    },
  ];
}

function warnOversized(
  kind: "chart" | "table",
  key: string,
  count: number,
  limit: number,
  returnedCount = limit,
) {
  if (count <= limit) return;
  console.warn("Dashboard payload bounded", { kind, key, rawCount: count, returnedCount });
}

/** Chart-friendly numeric projection of a typed display value. */
function numericValue(value: MetricDisplayValue | null): number | null {
  if (value === null) return null;
  switch (value.kind) {
    case "count":
    case "quantity":
    case "duration_seconds":
      return value.value;
    case "rate_basis_points":
      // Charts show percentages, not raw basis points.
      return value.value / 100;
    case "money":
      return value.value.minorUnits / 100;
    default:
      return null;
  }
}

const COMPARISON_LABELS = {
  previous_period: "vs previous period",
  previous_year: "vs previous year",
} as const;

/**
 * Percent change between two same-kind values. Returns null when a
 * percentage isn't meaningful (mismatched kinds, a zero baseline) rather
 * than inventing one — the pill then falls back to "Unavailable".
 */
function percentChange(
  current: MetricDisplayValue,
  previous: MetricDisplayValue,
): { readonly direction: "up" | "down" | "flat"; readonly value: string } | null {
  if (current.kind !== previous.kind) return null;
  const currentNumeric = numericValue(current);
  const previousNumeric = numericValue(previous);
  if (currentNumeric === null || previousNumeric === null) return null;
  const delta = currentNumeric - previousNumeric;
  if (delta === 0) return { direction: "flat", value: "0%" };
  if (previousNumeric === 0) return null;
  const percent = (delta / Math.abs(previousNumeric)) * 100;
  return {
    direction: delta > 0 ? "up" : "down",
    value: `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`,
  };
}

function comparisonFor(metric: MetricViewModel): DisplayComparison | null {
  if (!metric.comparison) return null;
  const label = COMPARISON_LABELS[metric.comparison.mode];
  if (metric.value === null || metric.comparison.value === null) {
    return { label, value: null };
  }
  const change = percentChange(metric.value, metric.comparison.value);
  return change
    ? { label, value: change.value, direction: change.direction }
    : { label, value: null };
}

function displayStateFor(metric: MetricViewModel): DisplayState {
  if (metric.implementationStatus === "BUSINESS_RULE_REQUIRED") return "business_rule_required";
  if (metric.implementationStatus === "SOURCE_LIMITED") return "source_limited";
  if (metric.implementationStatus === "NOT_V1") return "not_configured";
  if (
    metric.readiness.state === "no_activity" &&
    metric.implementationStatus === "DATA_PENDING" &&
    !metric.key.startsWith("klaviyo.")
  ) {
    return "data_pending";
  }
  return metric.readiness.state;
}

function compactPeriodLabel(period: string): string {
  // Month buckets arrive as ISO dates/instants; keep the calendar month.
  const match = /^(\d{4})-(\d{2})/.exec(period);
  return match ? `${match[1]}-${match[2]}` : period;
}

/**
 * Warning codes are backend telemetry. Readers of this dashboard are
 * executives, so the indicator says what the code means for the numbers on
 * screen rather than printing the identifier.
 */
const SOURCE_WARNING_COPY: Readonly<Record<string, string>> = {
  DATASET_UNAVAILABLE: "Some figures could not be loaded",
  PARTIAL_DATASET_FAILURE: "Some figures could not be loaded",
  DATASET_NOT_CONFIGURED: "Not connected yet",
  SOURCE_NOT_CONFIGURED: "Not connected yet",
  LIVE_CREDENTIAL_VERIFICATION_DEFERRED: "Not connected yet",
  CACHE_STALE_FALLBACK: "Showing the last confirmed values",
  DETAILED_HISTORY_INCOMPLETE: "History does not cover the full period",
  PARTIAL_HISTORY: "History does not cover the full period",
  SOURCE_LIMITED: "The source cannot supply this in full",
  BILLING_GEOGRAPHY_AGGREGATE_ONLY: "Regional detail is aggregated",
  CARRIER_EVENT_COVERAGE_VARIES: "Carrier coverage varies",
  KLAVIYO_NO_ACTIVITY: "No activity recorded",
  STALE_SOURCE: "Showing the last confirmed values",
  SOURCE_UNAVAILABLE: "The source could not be reached",
  REQUEST_FAILED: "The source could not be reached",
};

function sourceDetail(status: SourceStatus): string | undefined {
  const phrases = [
    ...new Set(
      status.warningCodes
        // `DATASET:<name>` tags which dataset failed; that is for the logs.
        .filter((code) => !code.startsWith("DATASET:"))
        .map((code) => SOURCE_WARNING_COPY[code])
        .filter((copy): copy is string => copy !== undefined),
    ),
  ];
  if (phrases.length > 0) return phrases.slice(0, 2).join(" · ");
  // A healthy, complete source needs no caption beyond its state and date.
  if (status.completeness === "complete") return undefined;
  return status.completeness === "partial"
    ? "Some figures could not be loaded"
    : "Coverage could not be confirmed";
}

function sourceIndicator(status: SourceStatus): SourceIndicatorModel {
  const detail = sourceDetail(status);
  return {
    label: SOURCE_LABELS[status.source],
    state: status.state,
    dataAsOf: status.dataAsOf,
    ...(detail ? { detail } : {}),
  };
}

/**
 * Pure projection of a certified backend page view model onto the display
 * contract the F3 components render. Blocked metrics arrive with null values
 * and therefore never enter `currentValues` — fabrication is impossible here.
 */
export function mapDashboardPageToDisplayData(
  page: DashboardPageViewModel,
  environment: "test" | "production",
): DashboardPageDisplayData {
  const currentValues: Record<string, MetricDisplayValue> = {};
  const states: Record<string, DisplayState> = {};
  const stateReasons: Record<string, string> = {};
  const comparisonValues: Record<string, DisplayComparison> = {};

  const registerMetric = (metric: MetricViewModel) => {
    states[metric.key] = displayStateFor(metric);
    if (metric.value !== null) {
      currentValues[metric.key] = metric.value;
    } else {
      const reason = metric.unavailableReason ?? metric.readiness.message;
      if (reason) stateReasons[metric.key] = reason;
    }
    const comparison = comparisonFor(metric);
    if (comparison) comparisonValues[metric.key] = comparison;
  };

  for (const metric of page.metrics) registerMetric(metric);

  const chartData: Record<string, readonly ChartDatum[]> = {};
  const chartValueFormats: Record<string, ChartValueFormat> = {};

  for (const series of page.series) {
    registerMetric(series.metric);
    warnOversized("chart", series.metric.key, series.points.length, TIME_SERIES_CHART_LIMIT);
    chartData[series.metric.key] = series.points.slice(0, TIME_SERIES_CHART_LIMIT).map((point) => ({
      key: point.period,
      label: compactPeriodLabel(point.period),
      value: numericValue(point.value),
    }));
  }

  for (const breakdown of page.breakdowns) {
    registerMetric(breakdown.metric);
    // The day/hour heatmap key is "<day>:<hour>" (see buildPurchaseHeatmapBreakdown);
    // splitting it into a group/label pair lets HeatmapChartView lay the data
    // out as a day-by-hour grid instead of 168 flat category-axis ticks.
    const projected =
      breakdown.dimension === "day_hour"
        ? breakdown.items.slice(0, 168).map((item) => {
            const [day, hour] = item.key.split(":");
            return {
              key: item.key,
              label: hour ?? item.label,
              value: numericValue(item.values[0] ?? null),
              group: day ?? "",
            };
          })
        : breakdown.items.map((item) => ({
            key: item.key,
            label: item.label,
            value: numericValue(item.values[0] ?? null),
          }));
    if (breakdown.dimension !== "day_hour") {
      warnOversized(
        "chart",
        breakdown.metric.key,
        projected.length,
        CATEGORICAL_CHART_LIMIT,
        CATEGORICAL_CHART_LIMIT + 1,
      );
      chartData[breakdown.metric.key] = summarizeCategoricalChartData(projected);
    } else {
      warnOversized("chart", breakdown.metric.key, breakdown.items.length, 168);
      chartData[breakdown.metric.key] = projected;
    }
  }

  const rowsByDataset: Record<string, readonly DisplayTableRow[]> = {};
  for (const table of page.tables) {
    registerMetric(table.metric);
    const dataset = drilldownDatasetByMetricKey.get(table.metric.key);
    warnOversized("table", dataset ?? table.metric.key, table.rows.length, 100);
    // Live tables load their own bounded drill-down pages. Keeping these rows
    // out of the RSC payload prevents a large source from blocking hydration.
    if (dataset && environment === "test") {
      rowsByDataset[dataset] = table.rows;
    }
    // A stage/count table doubles as funnel chart input. Those plotted values
    // are stage counts, not the metric's own unit (the funnel metric's value
    // is a conversion rate), so the unit is declared alongside the data.
    if (
      table.columns.length === 2 &&
      table.columns[0] === "stage" &&
      table.columns[1] === "count"
    ) {
      chartData[table.metric.key] = table.rows.map((row) => ({
        key: String(row["stage"]),
        label: String(row["stage"]),
        value: typeof row["count"] === "number" ? row["count"] : null,
      }));
      chartValueFormats[table.metric.key] = "count";
    }
    if (table.metric.key === "production.incoming") {
      chartData[table.metric.key] = table.rows.map((row, index) => ({
        key: String(row["poNumber"] ?? index),
        label: String(row["expectedArrivalDate"] ?? row["poNumber"] ?? index),
        value: typeof row["incomingUnits"] === "number" ? row["incomingUnits"] : null,
      }));
      chartValueFormats[table.metric.key] = "count";
    }
    if (table.metric.key === "social.performance") {
      chartData[table.metric.key] = table.rows.map((row, index) => ({
        key: `${String(row["platform"] ?? "social")}-${String(row["date"] ?? index)}`,
        label: String(row["date"] ?? row["platform"] ?? index),
        value: typeof row["followers"] === "number" ? row["followers"] : null,
      }));
      chartValueFormats[table.metric.key] = "count";
    }
    if (table.metric.key === "partners.performance") {
      chartData[table.metric.key] = table.rows.map((row, index) => ({
        key: String(row["partner"] ?? index),
        label: String(row["partner"] ?? index),
        value: typeof row["revenueMinorUnits"] === "number" ? row["revenueMinorUnits"] / 100 : null,
      }));
      chartValueFormats[table.metric.key] = "money";
    }
  }

  return {
    environment,
    synthetic: false,
    currentValues,
    chartData,
    chartValueFormats,
    rowsByDataset,
    sources: page.sources.map(sourceIndicator),
    states,
    stateReasons,
    comparisonValues,
  };
}

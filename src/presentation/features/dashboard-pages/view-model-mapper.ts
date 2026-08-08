import { drilldownCatalog } from "@/src/application/api/catalog";
import type {
  DashboardPageViewModel,
  MetricDisplayValue,
  MetricViewModel,
} from "@/src/application/view-models";
import type { SourceStatus } from "@/src/domain/contracts";
import type {
  ChartDatum,
  DisplayState,
  SourceIndicatorModel,
} from "@/src/presentation/components/dashboard/display-contracts";

import type { DashboardPageDisplayData, DisplayTableRow } from "./display-data";

const SOURCE_LABELS: Readonly<Record<SourceStatus["source"], string>> = {
  shopify: "Shopify",
  klaviyo: "Klaviyo",
  google_sheets: "Google Sheets",
  google_drive: "Google Drive",
  manual_workbook: "Manual workbook",
};

const drilldownDatasetByMetricKey = new Map(
  drilldownCatalog.map((definition) => [definition.metricKey, definition.dataset]),
);

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

function sourceIndicator(status: SourceStatus): SourceIndicatorModel {
  const detail =
    status.warningCodes.length > 0
      ? status.warningCodes.slice(0, 3).join(" · ")
      : `completeness: ${status.completeness}`;
  return {
    label: SOURCE_LABELS[status.source],
    state: status.state,
    dataAsOf: status.dataAsOf,
    detail,
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

  const registerMetric = (metric: MetricViewModel) => {
    states[metric.key] = displayStateFor(metric);
    if (metric.value !== null) {
      currentValues[metric.key] = metric.value;
    } else {
      const reason = metric.unavailableReason ?? metric.readiness.message;
      if (reason) stateReasons[metric.key] = reason;
    }
  };

  for (const metric of page.metrics) registerMetric(metric);

  const chartData: Record<string, readonly ChartDatum[]> = {};

  for (const series of page.series) {
    registerMetric(series.metric);
    chartData[series.metric.key] = series.points.map((point) => ({
      key: point.period,
      label: compactPeriodLabel(point.period),
      value: numericValue(point.value),
    }));
  }

  for (const breakdown of page.breakdowns) {
    registerMetric(breakdown.metric);
    chartData[breakdown.metric.key] = breakdown.items.map((item) => ({
      key: item.key,
      label: item.label,
      value: numericValue(item.values[0] ?? null),
    }));
  }

  const rowsByDataset: Record<string, readonly DisplayTableRow[]> = {};
  for (const table of page.tables) {
    registerMetric(table.metric);
    const dataset = drilldownDatasetByMetricKey.get(table.metric.key);
    if (dataset) {
      rowsByDataset[dataset] = table.rows;
    }
    // A stage/count table doubles as funnel chart input.
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
    }
  }

  return {
    environment,
    synthetic: false,
    currentValues,
    chartData,
    rowsByDataset,
    sources: page.sources.map(sourceIndicator),
    states,
    stateReasons,
  };
}

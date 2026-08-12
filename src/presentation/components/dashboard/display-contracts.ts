import type { MetricDisplayValue } from "@/src/application/view-models/metrics";

export type DisplayState =
  | "loading"
  | "current"
  | "empty"
  | "no_activity"
  | "not_configured"
  | "data_pending"
  | "business_rule_required"
  | "source_limited"
  | "partial"
  | "stale"
  | "invalid"
  | "unavailable"
  | "error";

export type DisplayTone = "neutral" | "positive" | "warning" | "danger";

export interface DisplayComparison {
  readonly label: string;
  readonly value: string | null;
  readonly direction?: "up" | "down" | "flat";
  readonly tone?: DisplayTone;
}

export interface ChartDatum {
  readonly key: string;
  readonly label: string;
  readonly value: number | null;
  readonly secondaryValue?: number | null;
  readonly seriesValues?: Readonly<Record<string, number | null>>;
  readonly group?: string;
  readonly minValue?: number | null;
  readonly maxValue?: number | null;
}

/** How a chart's plotted numbers are rendered on axes, tooltips, and labels. */
export type ChartValueFormat = "money" | "percent" | "count" | "quantity";

export interface ChartSeriesDefinition {
  readonly key: string;
  readonly label: string;
  readonly tone: "forest" | "gold" | "terracotta" | "sage" | "plum";
  readonly pattern?: "solid" | "dashed" | "dotted";
}

export interface LegendItem {
  readonly key: string;
  readonly label: string;
  readonly tone: "forest" | "gold" | "terracotta" | "sage" | "plum" | "muted";
  readonly pattern?: "solid" | "dashed" | "dotted";
}

export interface SourceIndicatorModel {
  readonly label: string;
  readonly state: DisplayState;
  readonly dataAsOf: string | null;
  readonly detail?: string;
}

export interface KpiDisplayModel {
  readonly label: string;
  readonly value: MetricDisplayValue | null;
  readonly state: DisplayState;
  readonly sourceLabel?: string;
  readonly valuePresentation?: "default" | "full" | "ratio";
  readonly unitSuffix?: string;
  readonly comparison?: DisplayComparison;
  readonly helpText?: string;
  readonly unavailableReason?: string;
  readonly sparkline?: readonly number[];
}

export interface StateCopy {
  readonly title: string;
  readonly description: string;
}

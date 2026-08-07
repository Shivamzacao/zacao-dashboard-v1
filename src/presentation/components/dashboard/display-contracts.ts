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
  readonly group?: string;
}

export interface ChartSeriesDefinition {
  readonly key: "value" | "secondaryValue";
  readonly label: string;
  readonly tone: "forest" | "gold" | "terracotta";
}

export interface LegendItem {
  readonly key: string;
  readonly label: string;
  readonly tone: "forest" | "gold" | "terracotta" | "muted";
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
  readonly comparison?: DisplayComparison;
  readonly helpText?: string;
  readonly unavailableReason?: string;
  readonly sparkline?: readonly number[];
}

export interface StateCopy {
  readonly title: string;
  readonly description: string;
}

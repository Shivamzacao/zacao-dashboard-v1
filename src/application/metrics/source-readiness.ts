import {
  metricTableViewModelSchema,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import type { SourceStatus } from "@/src/domain/contracts";

import type { HistoryCompletenessFact, MetricServiceContext, SopInspectionFact } from "./types";
import { createMetricViewModel } from "./view-model";

export function buildSourceFreshnessTable(
  context: MetricServiceContext,
  sources: readonly SourceStatus[],
  options: { readonly metricSources?: readonly SourceStatus[] } = {},
): MetricTableViewModel {
  // The table lists every source's state — including unconfigured ones — so
  // the metric's own readiness may be driven by the sources that actually
  // answered rather than being nulled by a deliberately absent integration.
  const base = createMetricViewModel({
    metricKey: "sources.freshness",
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: options.metricSources ?? sources,
    value: sources.length === 0 ? null : { kind: "status", value: "Source status available" },
  });
  return metricTableViewModelSchema.parse({
    metric: base,
    columns: [
      "source",
      "state",
      "checkedAt",
      "lastSuccessfulAt",
      "dataAsOf",
      "completeness",
      "warningCodes",
    ],
    rows: sources.map((source) => ({
      source: source.source,
      state: source.state,
      checkedAt: source.checkedAt,
      lastSuccessfulAt: source.lastSuccessfulAt,
      dataAsOf: source.dataAsOf,
      completeness: source.completeness,
      warningCodes: source.warningCodes.join(","),
    })),
  });
}

export function buildHistoricalCompletenessMetric(
  context: MetricServiceContext,
  history: HistoryCompletenessFact | null,
): MetricViewModel {
  return createMetricViewModel({
    metricKey: "sources.historical_completeness",
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: context.sourceStatuses,
    value:
      history === null
        ? null
        : { kind: "status", value: history.completeness === "complete" ? "Complete" : "Partial" },
    warnings:
      history === null || history.completeness === "complete" ? [] : ["PARTIAL_SHOPIFY_HISTORY"],
  });
}

export function buildKlaviyoNoActivityMetric(
  context: MetricServiceContext,
  hasActivity: boolean | null,
): MetricViewModel {
  return createMetricViewModel({
    metricKey: "quality.klaviyo_no_activity",
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: context.sourceStatuses,
    value:
      hasActivity === null
        ? null
        : { kind: "status", value: hasActivity ? "Activity detected" : "No activity yet" },
    warnings: hasActivity === false ? ["KLAVIYO_NO_ACTIVITY"] : [],
  });
}

export function buildSopValidationMetric(
  context: MetricServiceContext,
  inspection: SopInspectionFact | null,
): MetricViewModel {
  const warnings = inspection
    ? [
        ...(inspection.formulaErrorCells.length > 0 ? ["SOP_FORMULA_ERRORS"] : []),
        ...(inspection.placeholderCellCount > 0 ? ["SOP_PLACEHOLDERS"] : []),
      ]
    : [];
  return createMetricViewModel({
    metricKey: "quality.sop_validation",
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: context.sourceStatuses,
    value:
      inspection === null
        ? null
        : {
            kind: "status",
            value: warnings.length === 0 ? "Validation passed" : "Reference limitations detected",
          },
    warnings,
  });
}

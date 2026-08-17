import type { DateRange, Readiness, SourceStatus } from "@/src/domain/contracts";
import { metricCatalogEntry } from "@/src/domain/metrics/catalog";
import type { MetricDisplayValue, MetricViewModel } from "@/src/application/view-models";

type Environment = "test" | "production";

const sourceFailureOrder: readonly SourceStatus["state"][] = [
  "error",
  "unavailable",
  "invalid",
  "not_configured",
  "stale",
  "partial",
  "no_activity",
  "current",
];

function weakestSourceState(sources: readonly SourceStatus[]): SourceStatus["state"] {
  for (const state of sourceFailureOrder) {
    if (sources.some((source) => source.state === state)) return state;
  }
  return "not_configured";
}

function readiness(
  state: Readiness["state"],
  message: string | null,
  warnings: readonly string[],
): Readiness {
  return { state, message, warningCodes: [...new Set(warnings)] };
}

export function createMetricViewModel(input: {
  readonly metricKey: string;
  readonly environment: Environment;
  readonly dataPeriod: DateRange;
  readonly sources: readonly SourceStatus[];
  readonly value: MetricDisplayValue | null;
  readonly warnings?: readonly string[];
  readonly dataPendingReason?: string;
}): MetricViewModel {
  const definition = metricCatalogEntry(input.metricKey);
  if (!definition) throw new Error(`Unknown metric key: ${input.metricKey}`);
  const warnings = [
    ...(input.warnings ?? []),
    ...input.sources.flatMap((source) => source.warningCodes),
  ];

  if (definition.status === "NOT_V1") {
    return {
      key: definition.key,
      label: definition.label,
      definitionVersion: "1.0",
      implementationStatus: definition.status,
      value: null,
      readiness: readiness("not_configured", "This feature is outside Dashboard V1.", [
        "NOT_V1",
        ...warnings,
      ]),
      dataPeriod: input.dataPeriod,
      sources: [...input.sources],
      warnings: ["NOT_V1", ...warnings],
      unavailableReason: definition.blockingReason,
    };
  }

  if (definition.status === "BUSINESS_RULE_REQUIRED") {
    return {
      key: definition.key,
      label: definition.label,
      definitionVersion: "1.0",
      implementationStatus: definition.status,
      value: null,
      readiness: readiness("not_configured", "A required business rule has not been approved.", [
        "BUSINESS_RULE_REQUIRED",
        ...warnings,
      ]),
      dataPeriod: input.dataPeriod,
      sources: [...input.sources],
      warnings: ["BUSINESS_RULE_REQUIRED", ...warnings],
      unavailableReason: definition.blockingReason,
    };
  }

  if (definition.status === "SOURCE_LIMITED") {
    return {
      key: definition.key,
      label: definition.label,
      definitionVersion: "1.0",
      implementationStatus: definition.status,
      value: null,
      readiness: readiness(
        "partial",
        "The verified source cannot provide sufficiently complete data.",
        ["SOURCE_LIMITED", ...warnings],
      ),
      dataPeriod: input.dataPeriod,
      sources: [...input.sources],
      warnings: ["SOURCE_LIMITED", ...warnings],
      unavailableReason: definition.blockingReason,
    };
  }

  if (input.value === null && warnings.includes("SOURCE_LIMITED")) {
    return {
      key: definition.key,
      label: definition.label,
      definitionVersion: "1.0",
      implementationStatus: definition.status,
      value: null,
      readiness: readiness(
        "partial",
        "The verified source cannot provide sufficiently complete data.",
        warnings,
      ),
      dataPeriod: input.dataPeriod,
      sources: [...input.sources],
      warnings,
      unavailableReason: input.dataPendingReason ?? definition.blockingReason,
    };
  }

  const sourceState = weakestSourceState(input.sources);
  if (["error", "unavailable", "invalid", "not_configured"].includes(sourceState)) {
    return {
      key: definition.key,
      label: definition.label,
      definitionVersion: "1.0",
      implementationStatus: definition.status,
      value: null,
      readiness: readiness(sourceState, "A required source is not usable.", warnings),
      dataPeriod: input.dataPeriod,
      sources: [...input.sources],
      warnings,
      unavailableReason: input.dataPendingReason ?? definition.blockingReason,
    };
  }

  if (
    definition.status === "DATA_PENDING" &&
    input.environment === "production" &&
    input.value === null
  ) {
    return {
      key: definition.key,
      label: definition.label,
      definitionVersion: "1.0",
      implementationStatus: definition.status,
      value: null,
      readiness: readiness("no_activity", "Data source not ready.", ["DATA_PENDING", ...warnings]),
      dataPeriod: input.dataPeriod,
      sources: [...input.sources],
      warnings: ["DATA_PENDING", ...warnings],
      unavailableReason: input.dataPendingReason ?? definition.blockingReason,
    };
  }

  if (input.value === null) {
    return {
      key: definition.key,
      label: definition.label,
      definitionVersion: "1.0",
      implementationStatus: definition.status,
      value: null,
      readiness: readiness(
        "no_activity",
        input.dataPendingReason ?? "No genuine activity in the selected period.",
        warnings,
      ),
      dataPeriod: input.dataPeriod,
      sources: [...input.sources],
      warnings,
      // A caller that knows *why* the value is absent is more accurate than the
      // generic sentence: paid spend with no attributed-customer count is not the
      // same as no campaigns having run, and reading it as the latter is a
      // materially wrong conclusion.
      unavailableReason: input.dataPendingReason ?? null,
    };
  }

  const state = sourceState === "partial" || sourceState === "stale" ? sourceState : "current";
  return {
    key: definition.key,
    label: definition.label,
    definitionVersion: "1.0",
    implementationStatus: definition.status,
    value: input.value,
    readiness: readiness(
      state,
      state === "current" ? null : "Source data has a disclosed limitation.",
      warnings,
    ),
    dataPeriod: input.dataPeriod,
    sources: [...input.sources],
    warnings,
    unavailableReason: null,
  };
}

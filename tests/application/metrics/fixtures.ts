import type { MetricServiceContext } from "@/src/application/metrics";
import type { SourceStatus } from "@/src/domain/contracts";

export const PERIOD = { startDate: "2026-07-01", endDate: "2026-07-31" } as const;

export function source(
  sourceKey: SourceStatus["source"],
  state: SourceStatus["state"] = "current",
): SourceStatus {
  const successful = state === "current" || state === "partial" || state === "no_activity";
  return {
    source: sourceKey,
    state,
    checkedAt: "2026-08-07T12:00:00.000Z",
    lastSuccessfulAt: successful ? "2026-08-07T12:00:00.000Z" : null,
    dataAsOf: successful ? "2026-07-31T23:59:59.000Z" : null,
    completeness: state === "current" ? "complete" : state === "partial" ? "partial" : "unknown",
    warningCodes: state === "current" ? [] : [`SOURCE_${state.toUpperCase()}`],
  };
}

export function context(
  sourceStatuses: readonly SourceStatus[] = [source("shopify")],
  environment: "test" | "production" = "test",
): MetricServiceContext {
  return { environment, dataPeriod: PERIOD, sourceStatuses };
}

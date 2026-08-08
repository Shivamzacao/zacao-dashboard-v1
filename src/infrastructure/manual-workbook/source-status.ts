import type { ManualBatchSummary } from "@/src/application/ports/manual-workbook";
import type { SourceStatus } from "@/src/domain/contracts/source-status";

export function manualWorkbookStatus(input: {
  readonly checkedAt: string;
  readonly batches?: readonly ManualBatchSummary[];
  readonly error?: unknown;
}): SourceStatus {
  if (input.error) {
    return {
      source: "manual_workbook",
      state: "unavailable",
      checkedAt: input.checkedAt,
      lastSuccessfulAt: null,
      dataAsOf: null,
      completeness: "unknown",
      warningCodes: ["MANUAL_WORKBOOK_STORE_UNAVAILABLE"],
    };
  }
  const batches = input.batches ?? [];
  if (batches.length === 0) {
    return {
      source: "manual_workbook",
      state: "no_activity",
      checkedAt: input.checkedAt,
      lastSuccessfulAt: input.checkedAt,
      dataAsOf: null,
      completeness: "complete",
      warningCodes: ["MANUAL_WORKBOOK_EMPTY"],
    };
  }
  const dataAsOf = batches
    .map(({ uploadedAt }) => uploadedAt)
    .sort()
    .at(-1);
  return {
    source: "manual_workbook",
    state: "current",
    checkedAt: input.checkedAt,
    lastSuccessfulAt: input.checkedAt,
    dataAsOf: dataAsOf ?? null,
    completeness: "complete",
    warningCodes: [],
  };
}

export function deferredManualWorkbookStatus(checkedAt: string): SourceStatus {
  return {
    source: "manual_workbook",
    state: "not_configured",
    checkedAt,
    lastSuccessfulAt: null,
    dataAsOf: null,
    completeness: "unknown",
    warningCodes: ["DATABASE_URL_NOT_CONFIGURED"],
  };
}

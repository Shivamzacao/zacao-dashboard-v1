import type { SourceStatus } from "@/src/domain/contracts/source-status";

import type { GoogleWorkbookState } from "./parser";

export function googleSourceStatus(input: {
  readonly source: "google_drive" | "google_sheets";
  readonly state: GoogleWorkbookState;
  readonly checkedAt: string;
  readonly modifiedAt: string | null;
  readonly warningCodes: readonly string[];
}): SourceStatus {
  const stateMap: Record<GoogleWorkbookState, SourceStatus["state"]> = {
    ready: "current",
    data_source_not_ready: "no_activity",
    partial: "partial",
    stale: "stale",
    invalid_schema: "invalid",
    invalid_data: "invalid",
    unavailable: "unavailable",
    not_configured: "not_configured",
  };
  return {
    source: input.source,
    state: stateMap[input.state],
    checkedAt: input.checkedAt,
    lastSuccessfulAt: ["ready", "data_source_not_ready", "partial", "stale"].includes(input.state)
      ? input.checkedAt
      : null,
    dataAsOf: null,
    completeness:
      input.state === "ready" ? "complete" : input.state === "partial" ? "partial" : "unknown",
    warningCodes: [
      ...input.warningCodes,
      ...(input.modifiedAt === null ? [] : ["FILE_MODIFIED_TIME_NOT_BUSINESS_FRESHNESS"]),
    ],
  };
}

import type { SourceStatus } from "@/src/domain/contracts/source-status";

import { KlaviyoClientError } from "./client";

export function klaviyoSourceStatus(input: {
  checkedAt: string;
  recordCount?: number;
  error?: unknown;
}): SourceStatus {
  if (input.error instanceof KlaviyoClientError) {
    const invalid = input.error.kind === "authentication" || input.error.kind === "permission";
    return {
      source: "klaviyo",
      state: invalid ? "invalid" : "unavailable",
      checkedAt: input.checkedAt,
      lastSuccessfulAt: null,
      dataAsOf: null,
      completeness: "unknown",
      warningCodes: [`KLAVIYO_${input.error.kind.toUpperCase()}`],
    };
  }
  if (input.error) {
    return {
      source: "klaviyo",
      state: "error",
      checkedAt: input.checkedAt,
      lastSuccessfulAt: null,
      dataAsOf: null,
      completeness: "unknown",
      warningCodes: ["KLAVIYO_UNEXPECTED_ERROR"],
    };
  }
  return {
    source: "klaviyo",
    state: input.recordCount === 0 ? "no_activity" : "current",
    checkedAt: input.checkedAt,
    lastSuccessfulAt: input.checkedAt,
    dataAsOf: input.checkedAt,
    completeness: "complete",
    warningCodes: input.recordCount === 0 ? ["KLAVIYO_NO_ACTIVITY"] : [],
  };
}

import type { Readiness, SourceStatus } from "@/src/domain/contracts";

const CHECKED_AT = "2026-08-06T12:00:00.000Z";

export const readinessFixtures = {
  current: { state: "current", message: null, warningCodes: [] },
  noActivity: {
    state: "no_activity",
    message: "No genuine activity in this period.",
    warningCodes: [],
  },
  notConfigured: {
    state: "not_configured",
    message: "The required source is not configured.",
    warningCodes: ["SOURCE_NOT_CONFIGURED"],
  },
  partial: {
    state: "partial",
    message: "Detailed history is incomplete.",
    warningCodes: ["PARTIAL_HISTORY"],
  },
  stale: {
    state: "stale",
    message: "The last valid result is outside its freshness target.",
    warningCodes: ["STALE_SOURCE"],
  },
  invalid: {
    state: "invalid",
    message: "The source response failed validation.",
    warningCodes: ["INVALID_SOURCE"],
  },
  unavailable: {
    state: "unavailable",
    message: "The source could not be reached.",
    warningCodes: ["SOURCE_UNAVAILABLE"],
  },
  error: {
    state: "error",
    message: "The request could not be completed.",
    warningCodes: ["REQUEST_FAILED"],
  },
} as const satisfies Readonly<Record<string, Readiness>>;

export const sourceStatusFixtures = {
  current: {
    source: "shopify",
    state: "current",
    checkedAt: CHECKED_AT,
    lastSuccessfulAt: CHECKED_AT,
    dataAsOf: CHECKED_AT,
    completeness: "complete",
    warningCodes: [],
  },
  noActivity: {
    source: "klaviyo",
    state: "no_activity",
    checkedAt: CHECKED_AT,
    lastSuccessfulAt: CHECKED_AT,
    dataAsOf: CHECKED_AT,
    completeness: "complete",
    warningCodes: [],
  },
  notConfigured: {
    source: "google_sheets",
    state: "not_configured",
    checkedAt: CHECKED_AT,
    lastSuccessfulAt: null,
    dataAsOf: null,
    completeness: "unknown",
    warningCodes: ["SOURCE_NOT_CONFIGURED"],
  },
  partial: {
    source: "shopify",
    state: "partial",
    checkedAt: CHECKED_AT,
    lastSuccessfulAt: CHECKED_AT,
    dataAsOf: CHECKED_AT,
    completeness: "partial",
    warningCodes: ["PARTIAL_HISTORY"],
  },
  stale: {
    source: "google_sheets",
    state: "stale",
    checkedAt: CHECKED_AT,
    lastSuccessfulAt: "2026-08-01T12:00:00.000Z",
    dataAsOf: "2026-08-01T00:00:00.000Z",
    completeness: "unknown",
    warningCodes: ["STALE_SOURCE"],
  },
  invalid: {
    source: "google_drive",
    state: "invalid",
    checkedAt: CHECKED_AT,
    lastSuccessfulAt: null,
    dataAsOf: null,
    completeness: "unknown",
    warningCodes: ["INVALID_SCHEMA"],
  },
  unavailable: {
    source: "shopify",
    state: "unavailable",
    checkedAt: CHECKED_AT,
    lastSuccessfulAt: null,
    dataAsOf: null,
    completeness: "unknown",
    warningCodes: ["SOURCE_UNAVAILABLE"],
  },
  error: {
    source: "klaviyo",
    state: "error",
    checkedAt: CHECKED_AT,
    lastSuccessfulAt: null,
    dataAsOf: null,
    completeness: "unknown",
    warningCodes: ["REQUEST_FAILED"],
  },
} as const satisfies Readonly<Record<string, SourceStatus>>;

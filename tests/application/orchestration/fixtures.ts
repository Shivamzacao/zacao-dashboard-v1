import type { ClockPort } from "@/src/application/ports";
import type { DashboardFilters, SourceKey, SourceStatus } from "@/src/domain/contracts";

export class MutableClock implements ClockPort {
  constructor(private value: Date = new Date("2026-08-07T12:00:00.000Z")) {}

  now(): Date {
    return new Date(this.value);
  }

  advance(milliseconds: number): void {
    this.value = new Date(this.value.getTime() + milliseconds);
  }
}

export const FILTERS: DashboardFilters = {
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  channels: [],
  productSkus: [],
  locations: [],
};

export function status(source: SourceKey, state: SourceStatus["state"] = "current"): SourceStatus {
  const usable = ["current", "partial", "no_activity", "stale"].includes(state);
  return {
    source,
    state,
    checkedAt: "2026-08-07T12:00:00.000Z",
    lastSuccessfulAt: usable ? "2026-08-07T12:00:00.000Z" : null,
    dataAsOf: usable ? "2026-07-31T23:59:59.000Z" : null,
    completeness: state === "current" ? "complete" : state === "partial" ? "partial" : "unknown",
    warningCodes: state === "current" ? [] : [`SOURCE_${state.toUpperCase()}`],
  };
}

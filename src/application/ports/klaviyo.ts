import type { DashboardFilters, SourceStatus } from "@/src/domain/contracts";

export type KlaviyoCapability =
  | "account"
  | "metric_registry"
  | "campaigns"
  | "flows"
  | "campaign_report"
  | "flow_report"
  | "metric_aggregate";

export interface KlaviyoReadRequest {
  readonly capability: KlaviyoCapability;
  readonly filters: DashboardFilters;
}

export interface KlaviyoReadResult {
  readonly records: readonly unknown[];
  readonly sourceStatus: SourceStatus;
}

export interface KlaviyoPort {
  read(request: KlaviyoReadRequest): Promise<KlaviyoReadResult>;
}

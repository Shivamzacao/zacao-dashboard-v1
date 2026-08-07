import type {
  CacheMetadata,
  CachePolicy,
  DashboardFilters,
  SourceKey,
  SourceStatus,
} from "@/src/domain/contracts";
import type { DashboardSection } from "@/src/domain/metrics/catalog";
import type {
  DashboardPageViewModel,
  MetricBreakdownViewModel,
  MetricSeriesViewModel,
  MetricTableViewModel,
  MetricViewModel,
} from "@/src/application/view-models";

export const REPORTING_TIME_ZONE = "America/New_York" as const;
export const REPORTING_CURRENCY = "USD" as const;

export type RuntimeEnvironment = "test" | "production";
export type CacheMode = "default" | "bypass";

export interface DashboardRequest {
  readonly section: DashboardSection;
  readonly environment: RuntimeEnvironment;
  readonly filters: DashboardFilters;
  readonly cacheMode?: CacheMode;
}

export interface OrchestrationContext {
  readonly environment: RuntimeEnvironment;
  readonly dataPeriod: Pick<DashboardFilters, "startDate" | "endDate">;
  readonly filters: DashboardFilters;
  readonly reportingTimeZone: typeof REPORTING_TIME_ZONE;
  readonly currency: typeof REPORTING_CURRENCY;
  readonly sourceStatuses: readonly SourceStatus[];
}

export interface DashboardContribution {
  readonly metrics?: readonly MetricViewModel[];
  readonly series?: readonly MetricSeriesViewModel[];
  readonly breakdowns?: readonly MetricBreakdownViewModel[];
  readonly tables?: readonly MetricTableViewModel[];
  readonly sourceStatuses: readonly SourceStatus[];
  readonly warnings?: readonly string[];
}

export interface DashboardDatasetContributor {
  readonly dataset: string;
  readonly source: SourceKey;
  readonly sourceIdentity: string;
  readonly cachePolicy: CachePolicy;
  load(context: OrchestrationContext): Promise<DashboardContribution>;
}

export interface DatasetCacheMetadata {
  readonly dataset: string;
  readonly source: SourceKey;
  readonly cache: CacheMetadata;
}

export interface OrchestratedDashboardResult {
  readonly page: DashboardPageViewModel;
  readonly cache: readonly DatasetCacheMetadata[];
}

export type DashboardSectionPlan = Readonly<Partial<Record<DashboardSection, readonly string[]>>>;

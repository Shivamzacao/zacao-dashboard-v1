import type {
  OrchestratedDashboardResult,
  RuntimeEnvironment,
} from "@/src/application/orchestration";
import type { DashboardFilters, SourceStatus } from "@/src/domain/contracts";
import type { DashboardSection } from "@/src/domain/metrics/catalog";

import type { FilterOptions } from "./contracts";

export interface BackendApiRuntime {
  readonly environment: RuntimeEnvironment;
  readonly supportedFilters: FilterOptions;
  loadDashboard(
    section: DashboardSection,
    filters: DashboardFilters,
  ): Promise<OrchestratedDashboardResult>;
  sourceStatuses(): Promise<readonly SourceStatus[]>;
}

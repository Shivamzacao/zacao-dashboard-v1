import {
  dashboardApiResponseSchema,
  drilldownApiResponseSchema,
  frontendFixtureBundle,
} from "@/src/application/api";

import type {
  DashboardApiResponse,
  DrilldownApiResponse,
  FilterOptions,
} from "@/src/application/api";
import type { SourceStatus } from "@/src/domain/contracts";
import type { DashboardSlug } from "@/src/application/api";
import {
  f3CustomerPageFixtureData,
  f3PageFixtureData,
  f3ProductPageFixtureData,
  type F3PageFixtureData,
} from "@/src/presentation/fixtures/f3-page-data";

export interface FixtureShellContext {
  readonly environment: "test";
  readonly synthetic: true;
  readonly supportedFilters: FilterOptions;
  readonly sources: readonly SourceStatus[];
}

export interface DashboardDataProvider {
  readonly kind: "fixture";
  getShellContext(): FixtureShellContext;
  getRepresentativeDashboard(): DashboardApiResponse;
  getRepresentativeDrilldown(): DrilldownApiResponse;
  getF3PageData(slug?: DashboardSlug): F3PageFixtureData;
}

interface FixtureBundleInput {
  readonly environment: unknown;
  readonly synthetic: unknown;
  readonly dashboard: unknown;
  readonly drilldown: unknown;
}

export function createFixtureDashboardProvider(
  input: FixtureBundleInput = frontendFixtureBundle,
): DashboardDataProvider {
  if (input.environment !== "test" || input.synthetic !== true) {
    throw new Error("Phase 2 fixtures must be explicitly marked synthetic TEST data.");
  }

  const dashboard = dashboardApiResponseSchema.parse(input.dashboard);
  const drilldown = drilldownApiResponseSchema.parse(input.drilldown);

  return Object.freeze({
    kind: "fixture" as const,
    getShellContext: () =>
      Object.freeze({
        environment: "test" as const,
        synthetic: true as const,
        supportedFilters: dashboard.data.supportedFilters,
        sources: dashboard.meta.sources,
      }),
    getRepresentativeDashboard: () => dashboard,
    getRepresentativeDrilldown: () => drilldown,
    getF3PageData: (slug?: DashboardSlug) => {
      if (slug === "customers") return f3CustomerPageFixtureData;
      if (slug === "products") return f3ProductPageFixtureData;
      return f3PageFixtureData;
    },
  });
}

export const phase2FixtureProvider = createFixtureDashboardProvider();

import type { BackendApiRuntime, FilterOptions } from "@/src/application/api";
import {
  CacheCoordinator,
  DashboardOrchestrator,
  type DashboardContribution,
  type DashboardDatasetContributor,
} from "@/src/application/orchestration";
import type { DashboardFilters, SourceKey, SourceStatus } from "@/src/domain/contracts";
import type { DashboardSection } from "@/src/domain/metrics/catalog";
import { InMemoryCache } from "@/src/infrastructure/cache";
import { SystemClock } from "@/src/infrastructure/time";

const SOURCE_KEYS = ["shopify", "klaviyo", "google_sheets", "google_drive"] as const;

function deferredStatus(source: SourceKey, now: string): SourceStatus {
  return {
    source,
    state: "not_configured",
    checkedAt: now,
    lastSuccessfulAt: null,
    dataAsOf: null,
    completeness: "unknown",
    warningCodes: ["LIVE_CREDENTIAL_VERIFICATION_DEFERRED"],
  };
}

class DeferredContributor implements DashboardDatasetContributor {
  readonly cachePolicy = { freshForSeconds: 0, staleForSeconds: 0 };

  constructor(
    readonly dataset: string,
    readonly source: SourceKey,
    private readonly clock: SystemClock,
  ) {}

  get sourceIdentity(): string {
    return `deferred-${this.source}`;
  }

  async load(): Promise<DashboardContribution> {
    return { sourceStatuses: [deferredStatus(this.source, this.clock.now().toISOString())] };
  }
}

const SECTION_SOURCES: Readonly<Record<DashboardSection, readonly SourceKey[]>> = {
  "Executive Health": ["shopify", "klaviyo", "google_sheets"],
  "Revenue Intelligence": ["shopify", "google_sheets", "google_drive"],
  "Customer Intelligence": ["shopify"],
  "Product Intelligence": ["shopify", "google_sheets"],
  "Operations Intelligence": ["shopify", "google_sheets", "google_drive"],
  "Marketing Intelligence": ["shopify", "klaviyo", "google_sheets"],
  "Growth Intelligence": ["google_sheets"],
  "Financial Intelligence": ["shopify", "google_sheets", "google_drive"],
  "Insights and Data Quality": ["shopify", "klaviyo", "google_sheets", "google_drive"],
};

export class DefaultBackendApiRuntime implements BackendApiRuntime {
  readonly environment = "production" as const;
  readonly supportedFilters: FilterOptions = {
    channels: [],
    productSkus: [],
    locations: [],
  };
  private readonly clock = new SystemClock();
  private readonly orchestrator: DashboardOrchestrator;

  constructor() {
    const contributors = SOURCE_KEYS.map(
      (source) => new DeferredContributor(`deferred-${source}`, source, this.clock),
    );
    this.orchestrator = new DashboardOrchestrator(
      contributors,
      Object.fromEntries(
        Object.entries(SECTION_SOURCES).map(([section, sources]) => [
          section,
          sources.map((source) => `deferred-${source}`),
        ]),
      ),
      new CacheCoordinator(new InMemoryCache(this.clock, 100), this.clock),
      this.clock,
      4,
    );
  }

  loadDashboard(section: DashboardSection, filters: DashboardFilters) {
    return this.orchestrator.loadPage({ section, environment: this.environment, filters });
  }

  async sourceStatuses(): Promise<readonly SourceStatus[]> {
    const now = this.clock.now().toISOString();
    return SOURCE_KEYS.map((source) => deferredStatus(source, now));
  }
}

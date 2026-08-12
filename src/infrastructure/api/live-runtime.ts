import type { BackendApiRuntime, FilterOptions } from "@/src/application/api";
import { buildSourceFreshnessTable, buildSopValidationMetric } from "@/src/application/metrics";
import {
  CacheCoordinator,
  DashboardOrchestrator,
  type DashboardContribution,
  type DashboardDatasetContributor,
  type DashboardSectionPlan,
  type OrchestrationContext,
} from "@/src/application/orchestration";
import type { DashboardFilters, SourceKey, SourceStatus } from "@/src/domain/contracts";
import type { DashboardSection } from "@/src/domain/metrics/catalog";
import { InMemoryCache } from "@/src/infrastructure/cache";
import { ConsoleLogger } from "@/src/infrastructure/logging";
import { KlaviyoAdapter } from "@/src/infrastructure/klaviyo/adapter";
import { KlaviyoClient } from "@/src/infrastructure/klaviyo/client";
import type { KlaviyoConfiguration } from "@/src/infrastructure/klaviyo/config";
import type { SheetsTabDataSource } from "@/src/application/ports/sheets-tabs";
import { createKlaviyoContributors } from "@/src/infrastructure/klaviyo/contributors";
import { klaviyoSourceStatus } from "@/src/infrastructure/klaviyo/source-status";
import { ShopifyAdminAdapter } from "@/src/infrastructure/shopify/admin-graphql/adapter";
import { ShopifyGraphQlClient } from "@/src/infrastructure/shopify/client";
import {
  createShopifyContributors,
  type ShopifyAdapters,
} from "@/src/infrastructure/shopify/contributors";
import {
  createShopifyRuntime,
  type ShopifyRuntimeSettings,
} from "@/src/infrastructure/shopify/runtime";
import { ShopifyQlAdapter } from "@/src/infrastructure/shopify/shopifyql/adapter";
import { shopifyFailureStatus } from "@/src/infrastructure/shopify/source-status";
import { SystemClock } from "@/src/infrastructure/time";
import { createSheetsApiContributors } from "@/src/infrastructure/sheets-api/contributors";
import { SheetsApiClient } from "@/src/infrastructure/sheets-api/client";
import type { SheetsApiConfiguration } from "@/src/infrastructure/sheets-api/config";
import { createV1CompositeContributor } from "@/src/infrastructure/composite/v1-metrics";
import { createProductSheetMetricsContributor } from "@/src/infrastructure/composite/product-metrics";
import { GoogleReadClient } from "@/src/infrastructure/google/client";
import {
  APPROVED_GOOGLE_FILE_IDS,
  REQUIRED_GOOGLE_READ_SCOPES,
  type GoogleSourceConfiguration,
} from "@/src/infrastructure/google/config";
import { createGoogleAccessTokenProvider } from "@/src/infrastructure/google/auth";
import {
  GoogleReferenceAdapter,
  type SopWorkbookInspection,
} from "@/src/infrastructure/google/reference-adapters";

import { DefaultBackendApiRuntime } from "./default-runtime";

function deferredStatus(source: SourceKey, checkedAt: string): SourceStatus {
  return {
    source,
    state: "not_configured",
    checkedAt,
    lastSuccessfulAt: null,
    dataAsOf: null,
    completeness: "unknown",
    warningCodes: ["LIVE_CREDENTIAL_VERIFICATION_DEFERRED"],
  };
}

class DeferredSourceContributor implements DashboardDatasetContributor {
  readonly cachePolicy = { freshForSeconds: 0, staleForSeconds: 0 };

  constructor(
    readonly dataset: string,
    readonly source: SourceKey,
    private readonly now: () => Date,
  ) {}

  get sourceIdentity(): string {
    return `deferred-${this.source}`;
  }

  async load(): Promise<DashboardContribution> {
    return { sourceStatuses: [deferredStatus(this.source, this.now().toISOString())] };
  }
}

/** Memoized async bootstrap that resets after a failure instead of poisoning. */
function lazy<T>(factory: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= factory().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}

export const LIVE_DASHBOARD_SECTION_PLAN: Readonly<Record<DashboardSection, readonly string[]>> = {
  "Executive Health": [
    "shopify-customers",
    "shopify-funnel",
    "shopify-product-units",
    "shopify-catalog-inventory",
    "shopify-sales",
    "shopify-channels",
    "shopify-fulfillment",
    "sheets-operations",
    "insights-freshness",
    "v1-composite-metrics",
  ],
  "Revenue Intelligence": [
    "shopify-product-units",
    "shopify-sales",
    "shopify-purchase-timing",
    "shopify-channels",
    "v1-composite-metrics",
  ],
  "Customer Intelligence": [
    "shopify-customers",
    "shopify-funnel",
    "shopify-session-engagement",
    "shopify-customer-city",
    "sheets-customers",
    "klaviyo-performance",
    "klaviyo-profiles",
  ],
  "Product Intelligence": [
    "shopify-product-units",
    "shopify-catalog-inventory",
    "sheets-product",
    "v1-composite-metrics",
    "product-sheet-example-metrics",
  ],
  "Operations Intelligence": [
    "shopify-catalog-inventory",
    "shopify-refund-rate",
    "shopify-fulfillment",
    "sheets-operations",
    "v1-composite-metrics",
    "deferred-google_drive",
  ],
  "Marketing Intelligence": [
    "shopify-funnel",
    "klaviyo-performance",
    "klaviyo-engagement",
    "sheets-marketing",
  ],
  "Growth Intelligence": ["sheets-growth"],
  "Financial Intelligence": ["shopify-sales", "sheets-financial", "deferred-google_drive"],
  "Insights and Data Quality": [
    "shopify-history",
    "shopify-catalog-inventory",
    "shopify-channels",
    "klaviyo-readiness",
    "insights-freshness",
    "sheets-insights",
    "v1-composite-metrics",
  ],
};

export class LiveBackendApiRuntime implements BackendApiRuntime {
  readonly environment = "production" as const;
  readonly supportedFilters: FilterOptions = {
    channels: [],
    productSkus: [],
    locations: [],
  };

  private readonly clock = new SystemClock();
  private readonly orchestrator: DashboardOrchestrator;
  private readonly shopifyAdapters: (() => Promise<ShopifyAdapters>) | null;
  private readonly klaviyoAdapter: KlaviyoAdapter | null;
  private readonly sheetsSource: SheetsTabDataSource | null;
  private readonly sopInspection: (() => Promise<SopWorkbookInspection>) | null;

  constructor(
    shopifySettings: ShopifyRuntimeSettings | null,
    klaviyoConfiguration: KlaviyoConfiguration | null,
    dependencies: {
      fetchImplementation?: typeof fetch;
      sheetsConfiguration?: SheetsApiConfiguration | null;
    } = {},
  ) {
    const now = () => this.clock.now();
    const fetchDependency = dependencies.fetchImplementation
      ? { fetchImplementation: dependencies.fetchImplementation }
      : {};
    const clientFetch = dependencies.fetchImplementation
      ? { fetch: dependencies.fetchImplementation }
      : {};
    const sheetsConfiguration = dependencies.sheetsConfiguration ?? null;
    this.sheetsSource = sheetsConfiguration
      ? new SheetsApiClient(sheetsConfiguration, {
          ...clientFetch,
          now: () => this.clock.now(),
        })
      : null;
    this.sopInspection = sheetsConfiguration
      ? lazy(async () => {
          const googleConfiguration: GoogleSourceConfiguration = {
            environment: "production",
            activeWorkbookId: sheetsConfiguration.workbookId,
            productionWorkbookId: sheetsConfiguration.workbookId,
            budgetWorkbookId: APPROVED_GOOGLE_FILE_IDS.budgetWorkbook,
            sopWorkbookId: APPROVED_GOOGLE_FILE_IDS.sopWorkbook,
            reportingTimeZone: "America/New_York",
            grantedScopes: [...REQUIRED_GOOGLE_READ_SCOPES],
            requestTimeoutMs: sheetsConfiguration.timeoutMs,
            rowChunkSize: sheetsConfiguration.rowChunkSize,
          };
          const client = new GoogleReadClient(googleConfiguration, {
            fetch: dependencies.fetchImplementation ?? fetch,
            accessToken: createGoogleAccessTokenProvider(
              sheetsConfiguration.credential,
              REQUIRED_GOOGLE_READ_SCOPES,
            ),
          });
          const result = await new GoogleReferenceAdapter(client, googleConfiguration).readSop();
          return result.inspection;
        })
      : null;

    this.shopifyAdapters = shopifySettings
      ? lazy(async (): Promise<ShopifyAdapters> => {
          const runtime = await createShopifyRuntime(shopifySettings, fetchDependency);
          const client = new ShopifyGraphQlClient(
            runtime.configuration,
            {
              getToken: runtime.accessToken.getToken,
              invalidate: runtime.accessToken.invalidate,
            },
            clientFetch,
          );
          return {
            shopifyql: new ShopifyQlAdapter(client),
            admin: new ShopifyAdminAdapter(client, 25, 20),
            hasReadAllOrders: runtime.configuration.grantedScopes.includes("read_all_orders"),
          };
        })
      : null;

    this.klaviyoAdapter = klaviyoConfiguration
      ? new KlaviyoAdapter(
          new KlaviyoClient(klaviyoConfiguration, clientFetch),
          klaviyoConfiguration,
        )
      : null;

    const contributors: DashboardDatasetContributor[] = [
      new DeferredSourceContributor("deferred-google_drive", "google_drive", now),
    ];
    if (this.sheetsSource) {
      contributors.push(...createSheetsApiContributors(this.sheetsSource));
    } else {
      contributors.push(
        new DeferredSourceContributor("deferred-google_sheets", "google_sheets", now),
        new DeferredSourceContributor("sheets-operations", "google_sheets", now),
        new DeferredSourceContributor("sheets-customers", "google_sheets", now),
        new DeferredSourceContributor("sheets-product", "google_sheets", now),
        new DeferredSourceContributor("sheets-insights", "google_sheets", now),
        new DeferredSourceContributor("sheets-marketing", "google_sheets", now),
        new DeferredSourceContributor("sheets-growth", "google_sheets", now),
        new DeferredSourceContributor("sheets-financial", "google_sheets", now),
      );
    }

    if (this.shopifyAdapters) {
      contributors.push(
        ...createShopifyContributors({
          adapters: this.shopifyAdapters,
          sourceIdentity: shopifySettings?.storeDomain ?? "shopify",
          now,
        }),
      );
      if (this.sheetsSource) {
        contributors.push(
          createV1CompositeContributor({
            sheets: this.sheetsSource,
            shopify: this.shopifyAdapters,
            sourceIdentity: shopifySettings?.storeDomain ?? "shopify",
            now,
          }),
          createProductSheetMetricsContributor({
            sheets: this.sheetsSource,
            shopify: this.shopifyAdapters,
            sourceIdentity: shopifySettings?.storeDomain ?? "shopify",
            now,
          }),
        );
      }
    } else {
      contributors.push(
        new DeferredSourceContributor("shopify-customers", "shopify", now),
        new DeferredSourceContributor("shopify-funnel", "shopify", now),
        new DeferredSourceContributor("shopify-session-engagement", "shopify", now),
        new DeferredSourceContributor("shopify-product-units", "shopify", now),
        new DeferredSourceContributor("shopify-catalog-inventory", "shopify", now),
        new DeferredSourceContributor("shopify-history", "shopify", now),
        new DeferredSourceContributor("shopify-refund-rate", "shopify", now),
        new DeferredSourceContributor("shopify-sales", "shopify", now),
        new DeferredSourceContributor("shopify-purchase-timing", "shopify", now),
        new DeferredSourceContributor("shopify-geography", "shopify", now),
        new DeferredSourceContributor("shopify-customer-city", "shopify", now),
        new DeferredSourceContributor("shopify-channels", "shopify", now),
        new DeferredSourceContributor("shopify-fulfillment", "shopify", now),
      );
    }

    if (!this.sheetsSource || !this.shopifyAdapters) {
      contributors.push(
        new DeferredSourceContributor(
          "v1-composite-metrics",
          this.sheetsSource ? "shopify" : "google_sheets",
          now,
        ),
        new DeferredSourceContributor(
          "product-sheet-example-metrics",
          this.sheetsSource ? "shopify" : "google_sheets",
          now,
        ),
      );
    }

    if (this.klaviyoAdapter) {
      contributors.push(
        ...createKlaviyoContributors({
          adapter: this.klaviyoAdapter,
          sourceIdentity: "klaviyo",
          now,
          demographicProperties: klaviyoConfiguration?.demographicProperties ?? null,
        }),
      );
    } else {
      contributors.push(
        new DeferredSourceContributor("klaviyo-performance", "klaviyo", now),
        new DeferredSourceContributor("klaviyo-engagement", "klaviyo", now),
        new DeferredSourceContributor("klaviyo-profiles", "klaviyo", now),
        new DeferredSourceContributor("klaviyo-readiness", "klaviyo", now),
      );
    }

    contributors.push(this.createFreshnessContributor());

    this.orchestrator = new DashboardOrchestrator(
      contributors,
      LIVE_DASHBOARD_SECTION_PLAN as DashboardSectionPlan,
      new CacheCoordinator(new InMemoryCache(this.clock, 200), this.clock),
      this.clock,
      4,
      new ConsoleLogger(),
    );
  }

  loadDashboard(section: DashboardSection, filters: DashboardFilters) {
    return this.orchestrator.loadPage({ section, environment: this.environment, filters });
  }

  async sourceStatuses(): Promise<readonly SourceStatus[]> {
    return this.probeSources();
  }

  /**
   * Probes every source with one bounded read-only request and returns
   * truthful per-source states. Unconfigured sources stay `not_configured`.
   */
  private async probeSources(): Promise<readonly SourceStatus[]> {
    const checkedAt = () => this.clock.now().toISOString();
    const shopify: Promise<SourceStatus> = this.shopifyAdapters
      ? this.shopifyAdapters()
          .then(async (adapters) => {
            await adapters.admin.readShop();
            return {
              source: "shopify" as const,
              state: "current" as const,
              checkedAt: checkedAt(),
              lastSuccessfulAt: checkedAt(),
              dataAsOf: checkedAt(),
              completeness: "complete" as const,
              warningCodes: [],
            };
          })
          .catch((error: unknown) => shopifyFailureStatus(error, checkedAt()))
      : Promise.resolve(deferredStatus("shopify", checkedAt()));

    const klaviyo: Promise<SourceStatus> = this.klaviyoAdapter
      ? Promise.all([this.klaviyoAdapter.readAccount(), this.klaviyoAdapter.readEventPresence()])
          .then(([, hasEvents]) =>
            klaviyoSourceStatus({ checkedAt: checkedAt(), recordCount: hasEvents ? 1 : 0 }),
          )
          .catch((error: unknown) => klaviyoSourceStatus({ checkedAt: checkedAt(), error }))
      : Promise.resolve(deferredStatus("klaviyo", checkedAt()));

    const sheets: Promise<SourceStatus> = this.sheetsSource
      ? this.sheetsSource
          .readPageTabs("insights", ["Inventory_Snapshots", "Metric_Targets"])
          .then((result) => result.sourceStatus)
          .catch(
            () => this.sheetsSource?.sourceStatus() ?? deferredStatus("google_sheets", checkedAt()),
          )
      : Promise.resolve(deferredStatus("google_sheets", checkedAt()));

    const drive: Promise<SourceStatus> = this.sopInspection
      ? this.sopInspection()
          .then(() => ({
            source: "google_drive" as const,
            state: "current" as const,
            checkedAt: checkedAt(),
            lastSuccessfulAt: checkedAt(),
            dataAsOf: null,
            completeness: "complete" as const,
            warningCodes: [],
          }))
          .catch(() => ({
            source: "google_drive" as const,
            state: "unavailable" as const,
            checkedAt: checkedAt(),
            lastSuccessfulAt: null,
            dataAsOf: null,
            completeness: "unknown" as const,
            warningCodes: ["SOP_WORKBOOK_UNAVAILABLE"],
          }))
      : Promise.resolve(deferredStatus("google_drive", checkedAt()));

    const [shopifyStatus, klaviyoStatus, sheetsStatus, driveStatus] = await Promise.all([
      shopify,
      klaviyo,
      sheets,
      drive,
    ]);
    return [shopifyStatus, klaviyoStatus, sheetsStatus, driveStatus];
  }

  private createFreshnessContributor(): DashboardDatasetContributor {
    const probe = () => this.probeSources();
    const readSop = this.sopInspection;
    return new (class implements DashboardDatasetContributor {
      readonly dataset = "insights-freshness";
      readonly source = "shopify" as const;
      readonly sourceIdentity = "all-sources";
      readonly cachePolicy = { freshForSeconds: 60, staleForSeconds: 300 };

      async load(context: OrchestrationContext): Promise<DashboardContribution> {
        const statuses = await probe();
        const usable = statuses.filter(
          (status) => !["error", "unavailable", "invalid", "not_configured"].includes(status.state),
        );
        const metricSources = usable.length > 0 ? usable : statuses;
        const serviceContext = {
          environment: context.environment,
          dataPeriod: context.dataPeriod,
          sourceStatuses: metricSources,
        };
        const sopStatus = statuses.find((status) => status.source === "google_drive");
        const inspection = sopStatus?.state === "current" && readSop ? await readSop() : null;
        return {
          metrics: [
            buildSopValidationMetric(
              { ...serviceContext, sourceStatuses: sopStatus ? [sopStatus] : [] },
              inspection,
            ),
          ],
          tables: [buildSourceFreshnessTable(serviceContext, statuses, { metricSources })],
          sourceStatuses: usable,
        };
      }
    })();
  }
}

function safeLoad<T>(loader: () => T | null): T | null {
  try {
    return loader();
  } catch {
    // Malformed configuration must not crash the whole API; the affected
    // source simply stays deferred and truthfully reports not_configured.
    return null;
  }
}

export function createBackendApiRuntime(loaders: {
  shopify: () => ShopifyRuntimeSettings | null;
  klaviyo: () => KlaviyoConfiguration | null;
  sheets?: () => SheetsApiConfiguration | null;
}): BackendApiRuntime {
  const shopifySettings = safeLoad(loaders.shopify);
  const klaviyoConfiguration = safeLoad(loaders.klaviyo);
  const sheetsConfiguration = loaders.sheets ? safeLoad(loaders.sheets) : null;
  if (!shopifySettings && !klaviyoConfiguration && !sheetsConfiguration) {
    return new DefaultBackendApiRuntime();
  }
  return new LiveBackendApiRuntime(shopifySettings, klaviyoConfiguration, {
    sheetsConfiguration,
  });
}

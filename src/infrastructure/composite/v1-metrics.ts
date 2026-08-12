import {
  buildForecastVarianceTable,
  buildInventoryRunwayMetric,
  buildInventoryValueMetric,
  buildMissingSkuCostMetric,
  buildOperationalInventoryViews,
  buildRevenueChannelViews,
  buildSellThroughMetric,
  buildUnclassifiedChannelMetric,
  reconcileForecastActuals,
} from "@/src/application/metrics";
import type {
  DashboardContribution,
  DashboardDatasetContributor,
  OrchestrationContext,
} from "@/src/application/orchestration";
import type { SheetsTabDataSource } from "@/src/application/ports/sheets-tabs";
import type { CachePolicy, SourceStatus } from "@/src/domain/contracts";
import type { ShopifyAdapterProvider } from "@/src/infrastructure/shopify/contributors";
import {
  mapInventoryFacts,
  mapNativeChannelFacts,
  mapWeeklyProductUnitsFacts,
} from "@/src/infrastructure/shopify/facts";
import {
  selectExampleFallback,
  syntheticSourceStatus,
  syntheticWarnings,
} from "@/src/infrastructure/sheets-api/example-fallback";

const CACHE: CachePolicy = { freshForSeconds: 120, staleForSeconds: 900 };

function shopifyStatus(now: string): SourceStatus {
  return {
    source: "shopify",
    state: "current",
    checkedAt: now,
    lastSuccessfulAt: now,
    dataAsOf: now,
    completeness: "complete",
    warningCodes: [],
  };
}

export function createV1CompositeContributor(input: {
  readonly sheets: SheetsTabDataSource;
  readonly shopify: ShopifyAdapterProvider;
  readonly sourceIdentity: string;
  readonly now: () => Date;
}): DashboardDatasetContributor {
  return {
    dataset: "v1-composite-metrics",
    source: "google_sheets",
    sourceIdentity: `v1-composite-${input.sourceIdentity.replaceAll(/[^A-Za-z0-9._-]/g, "-")}`,
    cachePolicy: CACHE,
    async load(context: OrchestrationContext): Promise<DashboardContribution> {
      const [sheets, adapters] = await Promise.all([
        input.sheets.readPageTabs("operations", [
          "Inventory_Snapshots",
          "Production_Orders",
          "Sales_Forecast",
          "SKU_Master",
          "Channel_Mapping",
          "COGS_By_SKU",
          "Location_Master",
          "Metric_Targets",
        ]),
        input.shopify(),
      ]);
      const [weekly, channels, products] = await Promise.all([
        adapters.shopifyql.read({
          dataset: "product_units_weekly",
          dateRange: context.dataPeriod,
          grain: "week",
        }),
        adapters.shopifyql.read({ dataset: "native_channels", dateRange: context.dataPeriod }),
        adapters.admin.readProducts({
          dateRange: context.dataPeriod,
          hasReadAllOrders: adapters.hasReadAllOrders,
        }),
      ]);
      const checkedAt = input.now().toISOString();
      const shopifySourceStatus = shopifyStatus(checkedAt);
      const statuses = [sheets.sourceStatus, shopifySourceStatus];
      const metricContext = {
        environment: context.environment,
        dataPeriod: context.dataPeriod,
        sourceStatuses: statuses,
      };
      const actuals = mapWeeklyProductUnitsFacts(weekly.rows);
      const channelFacts = mapNativeChannelFacts(channels.rows);
      const skuMaster = sheets.tabs["SKU_Master"] ?? [];
      const forecasts = sheets.tabs["Sales_Forecast"] ?? [];
      const reconciled = reconcileForecastActuals(metricContext, forecasts, skuMaster, actuals);
      const channelMapping = selectExampleFallback(sheets, "Channel_Mapping");
      const revenueStatuses = [
        syntheticSourceStatus(sheets.sourceStatus, channelMapping.usedExample),
        shopifySourceStatus,
      ];
      const revenueContext = {
        ...metricContext,
        sourceStatuses: revenueStatuses,
      };
      const revenueChannels = buildRevenueChannelViews(
        revenueContext,
        channelFacts,
        channelMapping.rows,
      );
      const inventory = buildOperationalInventoryViews(
        metricContext,
        mapInventoryFacts(products.records),
        skuMaster,
        sheets.tabs["Location_Master"] ?? [],
        sheets.tabs["Inventory_Snapshots"] ?? [],
        sheets.tabs["Metric_Targets"] ?? [],
      );
      return {
        metrics: [
          revenueChannels.dtcTotal,
          revenueChannels.retailTotal,
          buildInventoryValueMetric(
            metricContext,
            sheets.tabs["Inventory_Snapshots"] ?? [],
            sheets.tabs["COGS_By_SKU"] ?? [],
          ),
          buildMissingSkuCostMetric(metricContext, skuMaster, sheets.tabs["COGS_By_SKU"] ?? []),
          buildSellThroughMetric(
            metricContext,
            sheets.tabs["Inventory_Snapshots"] ?? [],
            sheets.tabs["Production_Orders"] ?? [],
            actuals,
            skuMaster,
          ),
          buildInventoryRunwayMetric(
            metricContext,
            sheets.tabs["Inventory_Snapshots"] ?? [],
            forecasts,
          ),
          buildUnclassifiedChannelMetric(
            revenueContext,
            channelMapping.rows,
            channelFacts.map(({ channel }) => channel),
          ),
          inventory.stockHealth,
        ],
        breakdowns: [
          revenueChannels.channelMix,
          inventory.shopify,
          inventory.combined,
          inventory.stockBand,
        ],
        tables: [
          buildForecastVarianceTable(metricContext, reconciled.facts, reconciled.warnings),
          revenueChannels.channelPerformance,
        ],
        sourceStatuses: revenueStatuses,
        warnings: [
          ...syntheticWarnings(sheets.warnings, channelMapping.usedExample),
          ...reconciled.warnings,
        ],
      };
    },
  };
}

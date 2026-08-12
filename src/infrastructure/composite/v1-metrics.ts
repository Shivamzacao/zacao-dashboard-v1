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
      const skuMaster = selectExampleFallback(sheets, "SKU_Master");
      const locationMaster = selectExampleFallback(sheets, "Location_Master", (rows) =>
        rows.some(
          (row) =>
            typeof row["shopify_location_name"] === "string" &&
            row["shopify_location_name"].trim() !== "",
        ),
      );
      const stockTargets = selectExampleFallback(sheets, "Metric_Targets", (rows) => {
        const keys = new Set(rows.map((row) => row["metric_key"]));
        return keys.has("inventory.stock_min") && keys.has("inventory.stock_max");
      });
      const operationalExamplesUsed =
        skuMaster.usedExample || locationMaster.usedExample || stockTargets.usedExample;
      const checkedAt = input.now().toISOString();
      const shopifySourceStatus = shopifyStatus(checkedAt);
      const sheetsStatus = syntheticSourceStatus(sheets.sourceStatus, operationalExamplesUsed);
      const statuses = [sheetsStatus, shopifySourceStatus];
      const metricContext = {
        environment: context.environment,
        dataPeriod: context.dataPeriod,
        sourceStatuses: statuses,
      };
      const actuals = mapWeeklyProductUnitsFacts(weekly.rows);
      const channelFacts = mapNativeChannelFacts(channels.rows);
      const forecasts = sheets.tabs["Sales_Forecast"] ?? [];
      const reconciled = reconcileForecastActuals(
        metricContext,
        forecasts,
        skuMaster.rows,
        actuals,
      );
      const channelMapping = selectExampleFallback(sheets, "Channel_Mapping");
      const revenueStatuses = [
        syntheticSourceStatus(
          sheets.sourceStatus,
          channelMapping.usedExample || operationalExamplesUsed,
        ),
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
        skuMaster.rows,
        locationMaster.rows,
        sheets.tabs["Inventory_Snapshots"] ?? [],
        stockTargets.rows,
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
          buildMissingSkuCostMetric(
            metricContext,
            skuMaster.rows,
            sheets.tabs["COGS_By_SKU"] ?? [],
          ),
          buildSellThroughMetric(
            metricContext,
            sheets.tabs["Inventory_Snapshots"] ?? [],
            sheets.tabs["Production_Orders"] ?? [],
            actuals,
            skuMaster.rows,
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
          ...syntheticWarnings(
            sheets.warnings,
            channelMapping.usedExample || operationalExamplesUsed,
          ),
          ...reconciled.warnings,
        ],
      };
    },
  };
}

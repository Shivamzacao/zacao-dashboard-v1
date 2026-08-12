import {
  buildProductInventoryBreakdown,
  buildProductSellThroughMetric,
  buildProductSkuMarginViews,
  buildProductWeeksCoverMetric,
  hasApplicableProductLandedCosts,
  hasOpeningInventoryRows,
  hasProductSkuMappings,
  hasReceivedProductionRows,
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
  mapProductSalesFacts,
  mapProductUnitsFacts,
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

function subtractDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export function createProductSheetMetricsContributor(input: {
  readonly sheets: SheetsTabDataSource;
  readonly shopify: ShopifyAdapterProvider;
  readonly sourceIdentity: string;
  readonly now: () => Date;
}): DashboardDatasetContributor {
  return {
    dataset: "product-sheet-example-metrics",
    source: "google_sheets",
    sourceIdentity: `product-sheet-${input.sourceIdentity.replaceAll(/[^A-Za-z0-9._-]/g, "-")}`,
    cachePolicy: CACHE,
    async load(context: OrchestrationContext): Promise<DashboardContribution> {
      const [sheets, adapters] = await Promise.all([
        input.sheets.readPageTabs("product", [
          "Inventory_Snapshots",
          "Production_Orders",
          "Sales_Forecast",
          "SKU_Master",
          "COGS_By_SKU",
        ]),
        input.shopify(),
      ]);
      const trailingRange = {
        startDate: subtractDays(context.dataPeriod.endDate, 27),
        endDate: context.dataPeriod.endDate,
      };
      const [products, trailing, weekly, catalog] = await Promise.all([
        adapters.shopifyql.read({
          dataset: "product_line_classification",
          dateRange: context.dataPeriod,
        }),
        adapters.shopifyql.read({
          dataset: "product_line_classification",
          dateRange: trailingRange,
        }),
        adapters.shopifyql.read({
          dataset: "product_units_weekly",
          dateRange: context.dataPeriod,
          grain: "week",
        }),
        adapters.admin.readProducts({
          dateRange: context.dataPeriod,
          hasReadAllOrders: adapters.hasReadAllOrders,
        }),
      ]);

      const mapping = selectExampleFallback(sheets, "SKU_Master", hasProductSkuMappings);
      const costs = selectExampleFallback(sheets, "COGS_By_SKU", (rows) =>
        hasApplicableProductLandedCosts(rows, context.dataPeriod.endDate),
      );
      const snapshots = selectExampleFallback(sheets, "Inventory_Snapshots", (rows) =>
        hasOpeningInventoryRows(rows, context.dataPeriod.startDate),
      );
      const productionOrders = selectExampleFallback(sheets, "Production_Orders", (rows) =>
        hasReceivedProductionRows(rows, context.dataPeriod.startDate, context.dataPeriod.endDate),
      );
      const usedExample =
        mapping.usedExample ||
        costs.usedExample ||
        snapshots.usedExample ||
        productionOrders.usedExample;
      const sheetStatus = syntheticSourceStatus(sheets.sourceStatus, usedExample);
      const warnings = syntheticWarnings(sheets.warnings, usedExample);
      const statuses = [sheetStatus, shopifyStatus(input.now().toISOString())];
      const metricContext = {
        environment: context.environment,
        dataPeriod: context.dataPeriod,
        sourceStatuses: statuses,
      };
      const inventory = mapInventoryFacts(catalog.records);
      const periodLabel = `${context.dataPeriod.startDate}..${context.dataPeriod.endDate}`;
      const productUnits = mapProductUnitsFacts(products.rows, periodLabel);
      const trailingUnits = mapProductUnitsFacts(trailing.rows, "trailing-28-days");
      const margin = buildProductSkuMarginViews({
        context: metricContext,
        sales: mapProductSalesFacts(products.rows),
        units: productUnits,
        mappings: mapping.rows,
        costs: costs.rows,
        warnings,
      });

      return {
        metrics: [
          buildProductWeeksCoverMetric(
            metricContext,
            inventory,
            trailingUnits,
            mapping.rows,
            warnings,
          ),
          buildProductSellThroughMetric(
            metricContext,
            snapshots.rows,
            productionOrders.rows,
            mapWeeklyProductUnitsFacts(weekly.rows),
            mapping.rows,
          ),
        ],
        breakdowns: [
          buildProductInventoryBreakdown(metricContext, inventory, mapping.rows, warnings),
          margin.breakdown,
        ],
        tables: [margin.table],
        sourceStatuses: statuses,
        warnings,
      };
    },
  };
}

import {
  buildCashPositionMetric,
  buildActiveCustomersMetric,
  buildCashPositionBreakdown,
  buildCogsPerBarViews,
  buildCombinedInventoryBreakdown,
  buildDepletionsBreakdown,
  buildFinanceActualMetrics,
  buildGrantViews,
  buildGrowthPipelineMetrics,
  buildGrowthSocialViews,
  buildInputCostMovementBreakdown,
  buildInvestorViews,
  buildIncomingProductionTable,
  buildInventoryLotsTable,
  buildInventoryValueMetric,
  buildMissingSkuCostMetric,
  buildLowInventoryBreakdown,
  buildMarketingSpendMetric,
  buildMarketingSpendMonthlyBreakdown,
  buildSocialMarketingViews,
  buildManufacturerOtifBreakdown,
  buildManufacturerOperationsViews,
  buildPackagingViews,
  buildProductionCostBreakdown,
  buildRealizedLtvViews,
  hasComparableInputCostRows,
  hasManufacturerOtifRows,
  buildWarehouseAccuracyMetric,
} from "@/src/application/metrics";
import type { MetricServiceContext } from "@/src/application/metrics/types";
import type {
  DashboardContribution,
  DashboardDatasetContributor,
  OrchestrationContext,
} from "@/src/application/orchestration";
import type { SheetsDashboardPage, SheetsTabDataSource } from "@/src/application/ports/sheets-tabs";
import type { CachePolicy, SourceStatus } from "@/src/domain/contracts";
import {
  toCashPositionFacts,
  toCombinedInventoryFacts,
  toInventoryLotFacts,
  toProductionIncomingFacts,
} from "@/src/infrastructure/manual-workbook/facts";
import {
  toDepletionRecords,
  toFinanceActualRecords,
  toMarketingSpendRecords,
} from "@/src/infrastructure/manual-workbook/records";

import {
  selectExampleFallback,
  syntheticSourceStatus,
  syntheticWarnings,
} from "./example-fallback";

const SHEETS_CACHE: CachePolicy = { freshForSeconds: 30, staleForSeconds: 900 };

function context(value: OrchestrationContext, status: SourceStatus): MetricServiceContext {
  return { environment: value.environment, dataPeriod: value.dataPeriod, sourceStatuses: [status] };
}

class SheetsContributor implements DashboardDatasetContributor {
  readonly source = "google_sheets" as const;
  readonly sourceIdentity = "zacao-sheets-api";
  readonly cachePolicy = SHEETS_CACHE;

  constructor(
    readonly dataset: string,
    private readonly loader: (context: OrchestrationContext) => Promise<DashboardContribution>,
  ) {}

  load(value: OrchestrationContext) {
    return this.loader(value);
  }
}

export function createSheetsApiContributors(
  source: SheetsTabDataSource,
  executiveSource: SheetsTabDataSource | null = null,
): readonly DashboardDatasetContributor[] {
  const customers = new SheetsContributor("sheets-customers", async (value) => {
    const result = await source.readPageTabs("customers", ["Sales_Actuals", "Channel_Mapping"]);
    const sales = selectExampleFallback(result, "Sales_Actuals");
    const channelMapping = selectExampleFallback(result, "Channel_Mapping");
    const usedExample = sales.usedExample || channelMapping.usedExample;
    const status = syntheticSourceStatus(result.sourceStatus, usedExample);
    const warnings = syntheticWarnings(result.warnings, usedExample);
    const views = buildRealizedLtvViews({
      context: context(value, status),
      records: sales.rows,
      channelMapping: channelMapping.rows,
      channels: value.filters.channels,
      sourceWarnings: warnings,
    });
    return {
      metrics: [
        buildActiveCustomersMetric({
          context: context(value, status),
          records: sales.rows,
          sourceWarnings: warnings,
        }),
        views.metric,
      ],
      tables: [views.cohorts],
      sourceStatuses: [status],
      warnings,
    };
  });

  // Executive Health and Operations Intelligence share this loader but not their
  // workbook: the migration runs page by page, so Executive Health reads the new
  // operations workbook while Operations Intelligence stays on the legacy one.
  const operationsLoader =
    (from: SheetsTabDataSource, page: SheetsDashboardPage) =>
    async (value: OrchestrationContext) => {
      const result = await from.readPageTabs(page, [
        "Inventory_Snapshots",
        "Inventory_Lots",
        "Additional_Depletions",
        "Production_Orders",
        "Warehouse_Fulfillment",
        "Packaging_Materials",
        "Packaging_Inventory",
        "Packaging_Orders",
        "Packaging_Forecast",
        "Location_Master",
        "Sales_Forecast",
        "COGS_By_SKU",
        "Metric_Targets",
        "SKU_Master",
      ]);
      const otif = selectExampleFallback(result, "Production_Orders", hasManufacturerOtifRows);
      const manufacturerOrders = selectExampleFallback(result, "Production_Orders", (rows) =>
        rows.some(
          (row) =>
            typeof row["confirmed_date"] === "string" && typeof row["received_date"] === "string",
        ),
      );
      const incomingOrders = selectExampleFallback(result, "Production_Orders", (rows) =>
        toProductionIncomingFacts(rows).facts.some(
          ({ expectedArrivalDate }) =>
            expectedArrivalDate === null ||
            (expectedArrivalDate >= value.dataPeriod.startDate &&
              expectedArrivalDate <= value.dataPeriod.endDate),
        ),
      );
      const depletions = selectExampleFallback(result, "Additional_Depletions", (rows) =>
        rows.some((row) => {
          const date = row["movement_date"];
          return (
            typeof date === "string" &&
            date >= value.dataPeriod.startDate &&
            date <= value.dataPeriod.endDate
          );
        }),
      );
      const warehouse = selectExampleFallback(result, "Warehouse_Fulfillment", (rows) =>
        rows.some((row) => {
          const date = row["shipped_at"];
          return (
            typeof date === "string" &&
            date.slice(0, 10) >= value.dataPeriod.startDate &&
            date.slice(0, 10) <= value.dataPeriod.endDate
          );
        }),
      );
      const packagingMaterials = selectExampleFallback(result, "Packaging_Materials");
      const packagingInventory = selectExampleFallback(result, "Packaging_Inventory");
      const packagingOrders = selectExampleFallback(result, "Packaging_Orders");
      const packagingForecast = selectExampleFallback(result, "Packaging_Forecast");
      const costs = selectExampleFallback(result, "COGS_By_SKU", (rows) =>
        hasComparableInputCostRows(rows, value.dataPeriod.endDate),
      );
      const usedExample = [
        otif,
        manufacturerOrders,
        incomingOrders,
        depletions,
        warehouse,
        packagingMaterials,
        packagingInventory,
        packagingOrders,
        packagingForecast,
        costs,
      ].some(({ usedExample: used }) => used);
      const status = syntheticSourceStatus(result.sourceStatus, usedExample);
      const fallbackWarnings = syntheticWarnings(result.warnings, usedExample);
      const metricContext = context(value, status);
      const combined = toCombinedInventoryFacts(
        result.tabs["Inventory_Snapshots"] ?? [],
        result.tabs["Location_Master"] ?? [],
      );
      const incoming = toProductionIncomingFacts(incomingOrders.rows);
      const manufacturer = buildManufacturerOperationsViews(metricContext, manufacturerOrders.rows);
      const packaging = buildPackagingViews(
        metricContext,
        packagingMaterials.rows,
        packagingInventory.rows,
        packagingOrders.rows,
        packagingForecast.rows,
      );
      const fallback = (result.sourceStatus.dataAsOf ?? result.sourceStatus.checkedAt).slice(0, 10);
      // Purely sheet-derived, so it lives here rather than in the Shopify
      // composite — a provider rate limit must not blank a cost the workbook
      // can answer on its own.
      const cogsPerBar = buildCogsPerBarViews(
        context(value, syntheticSourceStatus(result.sourceStatus, costs.usedExample)),
        costs.rows,
        result.tabs["Metric_Targets"] ?? [],
        selectExampleFallback(result, "SKU_Master").rows,
        syntheticWarnings(result.warnings, costs.usedExample),
      );
      return {
        metrics: [
          ...manufacturer.metrics,
          buildWarehouseAccuracyMetric(metricContext, warehouse.rows),
          cogsPerBar.metric,
        ],
        breakdowns: [
          buildCombinedInventoryBreakdown(
            metricContext,
            combined.facts,
            combined.completeRequiredLocations,
          ),
          buildDepletionsBreakdown(metricContext, toDepletionRecords(depletions.rows)),
          buildProductionCostBreakdown(metricContext, result.tabs["Production_Orders"] ?? []),
          buildInputCostMovementBreakdown(
            context(value, syntheticSourceStatus(result.sourceStatus, costs.usedExample)),
            costs.rows,
            syntheticWarnings(result.warnings, costs.usedExample),
          ),
          buildManufacturerOtifBreakdown(
            context(value, syntheticSourceStatus(result.sourceStatus, otif.usedExample)),
            otif.rows,
            syntheticWarnings(result.warnings, otif.usedExample),
          ),
          manufacturer.performance,
          cogsPerBar.trend,
          packaging.stock,
          packaging.projection,
        ],
        tables: [
          buildInventoryLotsTable(
            metricContext,
            toInventoryLotFacts(result.tabs["Inventory_Lots"] ?? [], fallback),
          ),
          buildIncomingProductionTable(metricContext, incoming.facts),
          manufacturer.timeline,
          packaging.table,
        ],
        sourceStatuses: [status],
        warnings: [
          ...fallbackWarnings,
          ...(incoming.excludedWithoutExpectedDate
            ? [`PRODUCTION_ROWS_WITHOUT_EXPECTED_DATE:${incoming.excludedWithoutExpectedDate}`]
            : []),
        ],
      };
    };

  // Kept for any section still on the legacy workbook. Nothing references it now
  // that Operations Intelligence is migrated; removing a dataset is a separate call.
  const operations = new SheetsContributor(
    "sheets-operations",
    operationsLoader(source, "operations"),
  );
  // Named for the workbook it reads, not a page: Executive Health and Operations
  // Intelligence both use it and share one cached read.
  const migrated = executiveSource
    ? new SheetsContributor("sheets-migrated", operationsLoader(executiveSource, "migrated"))
    : null;

  // Product Intelligence is migrated, so this binds to the new workbook when it is
  // configured and falls back to the legacy one otherwise.
  const productSource = executiveSource ?? source;
  const productPage: SheetsDashboardPage = executiveSource ? "migrated" : "product";
  const product = new SheetsContributor("sheets-product", async (value) => {
    const result = await productSource.readPageTabs(productPage, [
      "Inventory_Snapshots",
      "COGS_By_SKU",
      "SKU_Master",
    ]);
    const skuMaster = selectExampleFallback(result, "SKU_Master");
    const status = syntheticSourceStatus(result.sourceStatus, skuMaster.usedExample);
    const warnings = syntheticWarnings(result.warnings, skuMaster.usedExample);
    const metricContext = context(value, status);
    return {
      metrics: [
        buildInventoryValueMetric(
          metricContext,
          result.tabs["Inventory_Snapshots"] ?? [],
          result.tabs["COGS_By_SKU"] ?? [],
        ),
        buildMissingSkuCostMetric(metricContext, skuMaster.rows, result.tabs["COGS_By_SKU"] ?? []),
      ],
      sourceStatuses: [status],
      warnings,
    };
  });

  const insights = new SheetsContributor("sheets-insights", async (value) => {
    const result = await source.readPageTabs("insights", ["Inventory_Snapshots", "Metric_Targets"]);
    const metricContext = context(value, result.sourceStatus);
    return {
      breakdowns: [
        buildLowInventoryBreakdown(
          metricContext,
          result.tabs["Inventory_Snapshots"] ?? [],
          result.tabs["Metric_Targets"] ?? [],
        ),
      ],
      sourceStatuses: [result.sourceStatus],
      warnings: result.warnings,
    };
  });

  const marketing = new SheetsContributor("sheets-marketing", async (value) => {
    const result = await source.readPageTabs("marketing", [
      "Marketing_Spend",
      "Social_Metrics",
      "Social_Channel_Performance",
    ]);
    const metricContext = context(value, result.sourceStatus);
    const social = buildSocialMarketingViews(
      metricContext,
      result.tabs["Social_Metrics"] ?? [],
      result.tabs["Social_Channel_Performance"] ?? [],
    );
    return {
      metrics: [
        buildMarketingSpendMetric(
          metricContext,
          toMarketingSpendRecords(result.tabs["Marketing_Spend"] ?? []),
        ),
        social.followers,
      ],
      breakdowns: [
        buildMarketingSpendMonthlyBreakdown(metricContext, result.tabs["Marketing_Spend"] ?? []),
        social.mentions,
      ],
      series: [social.growth],
      tables: [social.table],
      sourceStatuses: [result.sourceStatus],
      warnings: result.warnings,
    };
  });

  const growth = new SheetsContributor("sheets-growth", async (value) => {
    const result = await source.readPageTabs("growth", [
      "Growth_Pipeline",
      "Social_Metrics",
      "Metric_Targets",
      "Investor_Pipeline",
      "Grants",
    ]);
    const pipeline = selectExampleFallback(result, "Growth_Pipeline");
    const socialRows = selectExampleFallback(result, "Social_Metrics");
    const targets = selectExampleFallback(result, "Metric_Targets", (rows) =>
      rows.some((row) => row["metric_key"] === "growth.time_to_close_target"),
    );
    const investors = selectExampleFallback(result, "Investor_Pipeline");
    const grantsRows = selectExampleFallback(result, "Grants");
    const usedExample =
      pipeline.usedExample ||
      socialRows.usedExample ||
      targets.usedExample ||
      investors.usedExample ||
      grantsRows.usedExample;
    const status = syntheticSourceStatus(result.sourceStatus, usedExample);
    const warnings = syntheticWarnings(result.warnings, usedExample);
    const metricContext = context(value, status);
    const views = buildGrowthPipelineMetrics(metricContext, pipeline.rows, targets.rows);
    const social = buildGrowthSocialViews(metricContext, socialRows.rows);
    const investor = buildInvestorViews(metricContext, investors.rows);
    const grants = buildGrantViews(metricContext, grantsRows.rows);
    return {
      metrics: [
        ...views.metrics,
        social.metric,
        investor.metric,
        grants.secured,
        grants.submitted,
        grants.acceptance,
      ],
      breakdowns: [views.byType, views.weightedByIndustry, grants.rolling],
      series: [social.series],
      tables: [views.nextActions, investor.table, grants.table],
      sourceStatuses: [status],
      warnings,
    };
  });

  const financial = new SheetsContributor("sheets-financial", async (value) => {
    const result = await source.readPageTabs("finance", [
      "Finance_Actuals",
      "Cash_Position",
      "Inventory_Snapshots",
      "COGS_By_SKU",
      "Production_Orders",
    ]);
    const metricContext = context(value, result.sourceStatus);
    const finance = buildFinanceActualMetrics(
      metricContext,
      toFinanceActualRecords(result.tabs["Finance_Actuals"] ?? []),
    );
    const cash = toCashPositionFacts(result.tabs["Cash_Position"] ?? []);
    return {
      metrics: [
        finance.total,
        buildCashPositionMetric(metricContext, cash.facts, cash.completeAccountCoverage),
        buildInventoryValueMetric(
          metricContext,
          result.tabs["Inventory_Snapshots"] ?? [],
          result.tabs["COGS_By_SKU"] ?? [],
        ),
      ],
      breakdowns: [
        finance.composition,
        buildCashPositionBreakdown(metricContext, result.tabs["Cash_Position"] ?? []),
        buildProductionCostBreakdown(metricContext, result.tabs["Production_Orders"] ?? []),
      ],
      sourceStatuses: [result.sourceStatus],
      warnings: result.warnings,
    };
  });

  return [
    customers,
    operations,
    ...(migrated ? [migrated] : []),
    product,
    insights,
    marketing,
    growth,
    financial,
  ];
}

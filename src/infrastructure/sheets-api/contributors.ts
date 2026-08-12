import {
  buildCashPositionMetric,
  buildActiveCustomersMetric,
  buildCashPositionBreakdown,
  buildCombinedInventoryBreakdown,
  buildDepletionsBreakdown,
  buildFinanceActualMetrics,
  buildGrowthPipelineViews,
  buildInputCostMovementBreakdown,
  buildIncomingProductionTable,
  buildInventoryLotsTable,
  buildInventoryValueMetric,
  buildMissingSkuCostMetric,
  buildLowInventoryBreakdown,
  buildMarketingSpendMetric,
  buildMarketingSpendBreakdown,
  buildManufacturerOtifBreakdown,
  buildPartnerPerformanceTable,
  buildProductionCostBreakdown,
  buildRealizedLtvViews,
  buildSocialMetricsTable,
  hasComparableInputCostRows,
  hasManufacturerOtifRows,
} from "@/src/application/metrics";
import type { MetricServiceContext } from "@/src/application/metrics/types";
import type {
  DashboardContribution,
  DashboardDatasetContributor,
  OrchestrationContext,
} from "@/src/application/orchestration";
import type { SheetsTabDataSource } from "@/src/application/ports/sheets-tabs";
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
  toGrowthPipelineRecords,
  toMarketingSpendRecords,
  toPartnerPerformanceRecords,
  toSocialMetricsRecords,
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

  const operations = new SheetsContributor("sheets-operations", async (value) => {
    const result = await source.readPageTabs("operations", [
      "Inventory_Snapshots",
      "Inventory_Lots",
      "Additional_Depletions",
      "Production_Orders",
      "Location_Master",
      "Sales_Forecast",
      "COGS_By_SKU",
    ]);
    const metricContext = context(value, result.sourceStatus);
    const otif = selectExampleFallback(result, "Production_Orders", hasManufacturerOtifRows);
    const costs = selectExampleFallback(result, "COGS_By_SKU", (rows) =>
      hasComparableInputCostRows(rows, value.dataPeriod.endDate),
    );
    const usedExample = otif.usedExample || costs.usedExample;
    const status = syntheticSourceStatus(result.sourceStatus, usedExample);
    const fallbackWarnings = syntheticWarnings(result.warnings, usedExample);
    const combined = toCombinedInventoryFacts(
      result.tabs["Inventory_Snapshots"] ?? [],
      result.tabs["Location_Master"] ?? [],
    );
    const incoming = toProductionIncomingFacts(result.tabs["Production_Orders"] ?? []);
    const fallback = (result.sourceStatus.dataAsOf ?? result.sourceStatus.checkedAt).slice(0, 10);
    return {
      breakdowns: [
        buildCombinedInventoryBreakdown(
          metricContext,
          combined.facts,
          combined.completeRequiredLocations,
        ),
        buildDepletionsBreakdown(
          metricContext,
          toDepletionRecords(result.tabs["Additional_Depletions"] ?? []),
        ),
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
      ],
      tables: [
        buildInventoryLotsTable(
          metricContext,
          toInventoryLotFacts(result.tabs["Inventory_Lots"] ?? [], fallback),
        ),
        buildIncomingProductionTable(metricContext, incoming.facts),
      ],
      sourceStatuses: [status],
      warnings: [
        ...fallbackWarnings,
        ...(incoming.excludedWithoutExpectedDate
          ? [`PRODUCTION_ROWS_WITHOUT_EXPECTED_DATE:${incoming.excludedWithoutExpectedDate}`]
          : []),
      ],
    };
  });

  const product = new SheetsContributor("sheets-product", async (value) => {
    const result = await source.readPageTabs("product", [
      "Inventory_Snapshots",
      "COGS_By_SKU",
      "SKU_Master",
    ]);
    const metricContext = context(value, result.sourceStatus);
    return {
      metrics: [
        buildInventoryValueMetric(
          metricContext,
          result.tabs["Inventory_Snapshots"] ?? [],
          result.tabs["COGS_By_SKU"] ?? [],
        ),
        buildMissingSkuCostMetric(
          metricContext,
          result.tabs["SKU_Master"] ?? [],
          result.tabs["COGS_By_SKU"] ?? [],
        ),
      ],
      sourceStatuses: [result.sourceStatus],
      warnings: result.warnings,
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
    const result = await source.readPageTabs("marketing", ["Marketing_Spend"]);
    const metricContext = context(value, result.sourceStatus);
    return {
      metrics: [
        buildMarketingSpendMetric(
          metricContext,
          toMarketingSpendRecords(result.tabs["Marketing_Spend"] ?? []),
        ),
      ],
      breakdowns: [
        buildMarketingSpendBreakdown(metricContext, result.tabs["Marketing_Spend"] ?? []),
      ],
      sourceStatuses: [result.sourceStatus],
      warnings: result.warnings,
    };
  });

  const growth = new SheetsContributor("sheets-growth", async (value) => {
    const result = await source.readPageTabs("growth", [
      "Growth_Pipeline",
      "Affiliate_Ambassador_Perf",
      "Social_Metrics",
    ]);
    const metricContext = context(value, result.sourceStatus);
    const views = buildGrowthPipelineViews(
      metricContext,
      toGrowthPipelineRecords(result.tabs["Growth_Pipeline"] ?? []),
    );
    return {
      metrics: [views.open],
      breakdowns: [views.byType],
      tables: [
        views.nextActions,
        buildPartnerPerformanceTable(
          metricContext,
          toPartnerPerformanceRecords(result.tabs["Affiliate_Ambassador_Perf"] ?? []),
        ),
        buildSocialMetricsTable(
          metricContext,
          toSocialMetricsRecords(result.tabs["Social_Metrics"] ?? []),
        ),
      ],
      sourceStatuses: [result.sourceStatus],
      warnings: result.warnings,
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

  return [customers, operations, product, insights, marketing, growth, financial];
}

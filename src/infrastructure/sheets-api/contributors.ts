import {
  buildCashPositionMetric,
  buildCashPositionBreakdown,
  buildCombinedInventoryBreakdown,
  buildDepletionsBreakdown,
  buildFinanceActualMetrics,
  buildGrowthPipelineViews,
  buildIncomingProductionTable,
  buildInventoryLotsTable,
  buildInventoryValueMetric,
  buildMissingSkuCostMetric,
  buildLowInventoryBreakdown,
  buildMarketingSpendMetric,
  buildMarketingSpendBreakdown,
  buildPartnerPerformanceTable,
  buildProductionCostBreakdown,
  buildSocialMetricsTable,
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
  const operations = new SheetsContributor("sheets-operations", async (value) => {
    const result = await source.readPageTabs("operations", [
      "Inventory_Snapshots",
      "Inventory_Lots",
      "Additional_Depletions",
      "Production_Orders",
      "Location_Master",
      "Sales_Forecast",
    ]);
    const metricContext = context(value, result.sourceStatus);
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
      ],
      tables: [
        buildInventoryLotsTable(
          metricContext,
          toInventoryLotFacts(result.tabs["Inventory_Lots"] ?? [], fallback),
        ),
        buildIncomingProductionTable(metricContext, incoming.facts),
      ],
      sourceStatuses: [result.sourceStatus],
      warnings: [
        ...result.warnings,
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
      ],
      sourceStatuses: [result.sourceStatus],
      warnings: result.warnings,
    };
  });

  return [operations, product, insights, marketing, growth, financial];
}

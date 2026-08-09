import {
  buildCashPositionMetric,
  buildCombinedInventoryBreakdown,
  buildDepletionsBreakdown,
  buildFinanceActualMetrics,
  buildGrowthPipelineViews,
  buildIncomingProductionTable,
  buildInventoryLotsTable,
  buildMarketingSpendMetric,
  buildPartnerPerformanceTable,
  buildSocialMetricsTable,
} from "@/src/application/metrics";
import type { MetricServiceContext } from "@/src/application/metrics/types";
import type {
  DashboardContribution,
  DashboardDatasetContributor,
  OrchestrationContext,
} from "@/src/application/orchestration";
import type { ManualWorkbookStore } from "@/src/application/ports/manual-workbook";
import type { CachePolicy, SourceStatus } from "@/src/domain/contracts";

import {
  toCashPositionFacts,
  toCombinedInventoryFacts,
  toInventoryLotFacts,
  toProductionIncomingFacts,
} from "./facts";
import {
  toDepletionRecords,
  toFinanceActualRecords,
  toGrowthPipelineRecords,
  toMarketingSpendRecords,
  toPartnerPerformanceRecords,
  toSocialMetricsRecords,
} from "./records";
import { manualWorkbookStatus } from "./source-status";

const MANUAL_CACHE: CachePolicy = { freshForSeconds: 60, staleForSeconds: 300 };

function metricContext(
  context: OrchestrationContext,
  sourceStatuses: readonly SourceStatus[],
): MetricServiceContext {
  return {
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sourceStatuses,
  };
}

class ManualWorkbookContributor implements DashboardDatasetContributor {
  readonly source = "manual_workbook" as const;
  readonly sourceIdentity = "manual-workbook-db";
  readonly cachePolicy = MANUAL_CACHE;

  constructor(
    readonly dataset: string,
    private readonly loadContribution: (
      context: OrchestrationContext,
    ) => Promise<DashboardContribution>,
  ) {}

  load(context: OrchestrationContext): Promise<DashboardContribution> {
    return this.loadContribution(context);
  }
}

/**
 * Contributors serving the certified manual metric builders from the latest
 * committed import batches. Empty tables are truthful no-activity states.
 */
export function createManualWorkbookContributors(input: {
  store: ManualWorkbookStore;
  now: () => Date;
}): readonly DashboardDatasetContributor[] {
  const { store, now } = input;

  async function status(): Promise<SourceStatus> {
    const batches = await store.latestCommittedBatches();
    return manualWorkbookStatus({ checkedAt: now().toISOString(), batches });
  }

  const operations = new ManualWorkbookContributor("manual-operations", async (context) => {
    const [snapshots, lots, depletions, productionOrders, locationMaster, sourceStatus] =
      await Promise.all([
        store.readTabRecords("Inventory_Snapshots"),
        store.readTabRecords("Inventory_Lots"),
        store.readTabRecords("Additional_Depletions"),
        store.readTabRecords("Production_Orders"),
        store.readTabRecords("Location_Master"),
        status(),
      ]);
    const serviceContext = metricContext(context, [sourceStatus]);
    const combined = toCombinedInventoryFacts(snapshots, locationMaster);
    const incoming = toProductionIncomingFacts(productionOrders);
    const fallbackAsOfDate = (sourceStatus.dataAsOf ?? sourceStatus.checkedAt).slice(0, 10);
    return {
      breakdowns: [
        buildCombinedInventoryBreakdown(
          serviceContext,
          combined.facts,
          combined.completeRequiredLocations,
        ),
        buildDepletionsBreakdown(serviceContext, toDepletionRecords(depletions)),
      ],
      tables: [
        buildInventoryLotsTable(serviceContext, toInventoryLotFacts(lots, fallbackAsOfDate)),
        buildIncomingProductionTable(serviceContext, incoming.facts),
      ],
      sourceStatuses: [sourceStatus],
      ...(incoming.excludedWithoutExpectedDate > 0
        ? {
            warnings: [
              `PRODUCTION_ROWS_WITHOUT_EXPECTED_DATE:${incoming.excludedWithoutExpectedDate}`,
            ],
          }
        : {}),
    };
  });

  const marketing = new ManualWorkbookContributor("manual-marketing", async (context) => {
    const [spend, social, sourceStatus] = await Promise.all([
      store.readTabRecords("Marketing_Spend"),
      store.readTabRecords("Social_Metrics"),
      status(),
    ]);
    const serviceContext = metricContext(context, [sourceStatus]);
    return {
      metrics: [buildMarketingSpendMetric(serviceContext, toMarketingSpendRecords(spend))],
      tables: [buildSocialMetricsTable(serviceContext, toSocialMetricsRecords(social))],
      sourceStatuses: [sourceStatus],
    };
  });

  const growth = new ManualWorkbookContributor("manual-growth", async (context) => {
    const [pipeline, partners, sourceStatus] = await Promise.all([
      store.readTabRecords("Growth_Pipeline"),
      store.readTabRecords("Affiliate_Ambassador_Perf"),
      status(),
    ]);
    const serviceContext = metricContext(context, [sourceStatus]);
    const views = buildGrowthPipelineViews(serviceContext, toGrowthPipelineRecords(pipeline));
    return {
      metrics: [views.open],
      breakdowns: [views.byType],
      tables: [
        views.nextActions,
        buildPartnerPerformanceTable(serviceContext, toPartnerPerformanceRecords(partners)),
      ],
      sourceStatuses: [sourceStatus],
    };
  });

  const financial = new ManualWorkbookContributor("manual-financial", async (context) => {
    const [actuals, cash, sourceStatus] = await Promise.all([
      store.readTabRecords("Finance_Actuals"),
      store.readTabRecords("Cash_Position"),
      status(),
    ]);
    const serviceContext = metricContext(context, [sourceStatus]);
    const finance = buildFinanceActualMetrics(serviceContext, toFinanceActualRecords(actuals));
    const cashMapping = toCashPositionFacts(cash);
    return {
      metrics: [
        finance.total,
        buildCashPositionMetric(
          serviceContext,
          cashMapping.facts,
          cashMapping.completeAccountCoverage,
        ),
      ],
      breakdowns: [finance.composition],
      sourceStatuses: [sourceStatus],
    };
  });

  return [operations, marketing, growth, financial];
}

import { buildGrowthPartnerViews } from "@/src/application/metrics";
import type {
  DashboardContribution,
  DashboardDatasetContributor,
  OrchestrationContext,
} from "@/src/application/orchestration";
import type { SheetsDashboardPage, SheetsTabDataSource } from "@/src/application/ports/sheets-tabs";
import type { CachePolicy, SourceStatus } from "@/src/domain/contracts";
import type { ShopifyAdapterProvider } from "@/src/infrastructure/shopify/contributors";
import { mapAffiliateSalesFacts } from "@/src/infrastructure/shopify/facts";

const CACHE: CachePolicy = { freshForSeconds: 120, staleForSeconds: 900 };

function shopifyStatus(checkedAt: string): SourceStatus {
  return {
    source: "shopify",
    state: "current",
    checkedAt,
    lastSuccessfulAt: checkedAt,
    dataAsOf: checkedAt,
    completeness: "complete",
    warningCodes: [],
  };
}

export function createGrowthCompositeContributor(input: {
  readonly sheets: SheetsTabDataSource;
  readonly shopify: ShopifyAdapterProvider;
  readonly sourceIdentity: string;
  readonly now: () => Date;
  readonly page?: SheetsDashboardPage;
}): DashboardDatasetContributor {
  const page = input.page ?? "growth";
  return {
    dataset: "growth-composite-metrics",
    source: "google_sheets",
    sourceIdentity: `growth-composite-${input.sourceIdentity.replaceAll(/[^A-Za-z0-9._-]/g, "-")}`,
    cachePolicy: CACHE,
    async load(context: OrchestrationContext): Promise<DashboardContribution> {
      const [sheets, adapters] = await Promise.all([
        input.sheets.readPageTabs(page, ["Affiliate_Ambassador_Perf"]),
        input.shopify(),
      ]);
      const sales = await adapters.shopifyql.read({
        dataset: "affiliate_sales",
        dateRange: context.dataPeriod,
      });
      const statuses = [sheets.sourceStatus, shopifyStatus(input.now().toISOString())];
      const views = buildGrowthPartnerViews(
        {
          environment: context.environment,
          dataPeriod: context.dataPeriod,
          sourceStatuses: statuses,
        },
        sheets.tabs["Affiliate_Ambassador_Perf"] ?? [],
        mapAffiliateSalesFacts(sales.rows),
      );
      return {
        metrics: [views.metric],
        breakdowns: [views.breakdown],
        tables: [views.table],
        sourceStatuses: statuses,
        warnings: sheets.warnings,
      };
    },
  };
}

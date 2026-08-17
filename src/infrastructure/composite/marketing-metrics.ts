import {
  buildAffiliateMarketingViews,
  buildBlockedCampaignRoi,
  buildCollaborationViews,
} from "@/src/application/metrics";
import type {
  DashboardContribution,
  DashboardDatasetContributor,
  OrchestrationContext,
} from "@/src/application/orchestration";
import type { SheetsDashboardPage, SheetsTabDataSource } from "@/src/application/ports/sheets-tabs";
import type { CachePolicy, SourceStatus } from "@/src/domain/contracts";
import type { ShopifyAdapterProvider } from "@/src/infrastructure/shopify/contributors";
import {
  mapAffiliateSalesFacts,
  mapAffiliateSessionFacts,
} from "@/src/infrastructure/shopify/facts";

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

export function createMarketingCompositeContributor(input: {
  readonly sheets: SheetsTabDataSource;
  readonly shopify: ShopifyAdapterProvider;
  readonly sourceIdentity: string;
  readonly now: () => Date;
  readonly page?: SheetsDashboardPage;
}): DashboardDatasetContributor {
  const page = input.page ?? "marketing";
  return {
    dataset: "marketing-composite-metrics",
    source: "google_sheets",
    sourceIdentity: `marketing-composite-${input.sourceIdentity.replaceAll(/[^A-Za-z0-9._-]/g, "-")}`,
    cachePolicy: CACHE,
    async load(context: OrchestrationContext): Promise<DashboardContribution> {
      const [sheets, adapters] = await Promise.all([
        input.sheets.readPageTabs(page, ["Affiliate_Ambassador_Perf", "Growth_Pipeline"]),
        input.shopify(),
      ]);
      const [sessions, sales] = await Promise.all([
        adapters.shopifyql.read({ dataset: "affiliate_sessions", dateRange: context.dataPeriod }),
        adapters.shopifyql.read({ dataset: "affiliate_sales", dateRange: context.dataPeriod }),
      ]);
      const shopify = shopifyStatus(input.now().toISOString());
      const statuses = [sheets.sourceStatus, shopify];
      const metricContext = {
        environment: context.environment,
        dataPeriod: context.dataPeriod,
        sourceStatuses: statuses,
      };
      const affiliate = buildAffiliateMarketingViews(
        metricContext,
        sheets.tabs["Affiliate_Ambassador_Perf"] ?? [],
        mapAffiliateSessionFacts(sessions.rows),
        mapAffiliateSalesFacts(sales.rows),
      );
      const collaborations = buildCollaborationViews(
        { ...metricContext, sourceStatuses: [sheets.sourceStatus] },
        sheets.tabs["Growth_Pipeline"] ?? [],
      );
      return {
        metrics: [affiliate.active, affiliate.sessions, affiliate.revenue, collaborations.active],
        breakdowns: [
          collaborations.reach,
          collaborations.categories,
          affiliate.roi,
          buildBlockedCampaignRoi(metricContext),
        ],
        tables: [affiliate.table, collaborations.table],
        sourceStatuses: statuses,
        warnings: sheets.warnings,
      };
    },
  };
}

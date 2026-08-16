import { buildActiveCustomersMetric, buildRealizedLtvViews } from "@/src/application/metrics";
import type {
  DashboardContribution,
  DashboardDatasetContributor,
  OrchestrationContext,
} from "@/src/application/orchestration";
import type { SheetsDashboardPage, SheetsTabDataSource } from "@/src/application/ports/sheets-tabs";
import type { CachePolicy, SourceStatus } from "@/src/domain/contracts";
import { mapShopifyLtvRecords } from "@/src/infrastructure/shopify/facts";
import type { ShopifyAdapterProvider } from "@/src/infrastructure/shopify/contributors";

// Orders change slowly and the read is expensive, so this mirrors the admin cache
// rather than the shorter ShopifyQL one. A cold miss competes with the page's other
// provider calls, and a stale-but-true cohort beats a throttled blank.
const CACHE: CachePolicy = { freshForSeconds: 900, staleForSeconds: 86_400 };

/**
 * Realized LTV, cohorts and active customers sourced from Shopify orders.
 *
 * The calculations are untouched and already certified — only the source changes.
 * Previously these read a Sales_Actuals tab that held nothing but seeded example
 * rows, so the page reported fabricated customer value. Shopify is the designated
 * owner of commerce actuals (spec §3) and of cohort history (spec §5.4).
 *
 * Channel_Mapping still comes from the workbook so that a channel filter classifies
 * identically here and on Revenue Intelligence; it is unused when no filter is set.
 */
export function createCustomerLtvContributor(input: {
  readonly sheets: SheetsTabDataSource | null;
  readonly shopify: ShopifyAdapterProvider;
  readonly sourceIdentity: string;
  readonly now: () => Date;
  readonly page?: SheetsDashboardPage;
}): DashboardDatasetContributor {
  const page = input.page ?? "customers";
  return {
    dataset: "shopify-customer-ltv",
    source: "shopify",
    sourceIdentity: `customer-ltv-${input.sourceIdentity.replaceAll(/[^A-Za-z0-9._-]/g, "-")}`,
    cachePolicy: CACHE,
    async load(context: OrchestrationContext): Promise<DashboardContribution> {
      const adapters = await input.shopify();
      // Deliberately not scoped to the reporting period: first_order_date is only
      // correct across a customer's whole history, and a period-scoped read would
      // relabel long-standing customers as new.
      const orders = await adapters.admin.readOrders({
        dateRange: { startDate: "2000-01-01", endDate: context.dataPeriod.endDate },
        hasReadAllOrders: adapters.hasReadAllOrders,
      });
      const checkedAt = input.now().toISOString();
      const records = mapShopifyLtvRecords(orders.records, checkedAt.slice(0, 10));

      const channelMapping = input.sheets
        ? await input.sheets
            .readPageTabs(page, ["Channel_Mapping"])
            .then((result) => result.tabs["Channel_Mapping"] ?? [])
            .catch(() => [])
        : [];

      const status: SourceStatus = {
        source: "shopify",
        state: "current",
        checkedAt,
        lastSuccessfulAt: checkedAt,
        dataAsOf: checkedAt,
        completeness: adapters.hasReadAllOrders && !orders.truncated ? "complete" : "partial",
        warningCodes: adapters.hasReadAllOrders
          ? orders.truncated
            ? ["SHOPIFY_ORDER_HISTORY_TRUNCATED"]
            : []
          : ["SHOPIFY_DETAILED_HISTORY_PARTIAL"],
      };
      const metricContext = {
        environment: context.environment,
        dataPeriod: context.dataPeriod,
        sourceStatuses: [status],
      };
      const views = buildRealizedLtvViews({
        context: metricContext,
        records,
        channelMapping,
        channels: context.filters.channels,
        sourceWarnings: status.warningCodes,
      });
      return {
        metrics: [
          buildActiveCustomersMetric({
            context: metricContext,
            records,
            sourceWarnings: status.warningCodes,
          }),
          views.metric,
        ],
        tables: [views.cohorts],
        sourceStatuses: [status],
        warnings: status.warningCodes,
      };
    },
  };
}

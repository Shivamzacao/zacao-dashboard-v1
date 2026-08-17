import {
  buildActiveCustomersMetric,
  buildPaidAcquisitionViews,
  buildRealizedLtvViews,
} from "@/src/application/metrics";
import type {
  DashboardContribution,
  DashboardDatasetContributor,
  OrchestrationContext,
} from "@/src/application/orchestration";
import type {
  SheetsDashboardPage,
  SheetsTabDataSource,
  SheetsTabReadResult,
} from "@/src/application/ports/sheets-tabs";
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

      // Marketing_Spend rides along for Blended CAC's numerator (DEC-019). This is a
      // second cache entry rather than a shared one — the sheets cache keys on
      // `page:sortedTabs` — so it costs one extra batchGet per fresh window, not a
      // second full workbook read.
      //
      // A failed read must stay distinguishable from an empty tab: absent spend rows
      // would otherwise divide a zero numerator and read as "no campaigns ran".
      const unreadable: {
        readonly tabs: SheetsTabReadResult["tabs"];
        readonly status: SourceStatus | null;
        readonly read: boolean;
      } = { tabs: {}, status: null, read: false };
      const sheetTabs = input.sheets
        ? await input.sheets
            .readPageTabs(page, ["Channel_Mapping", "Marketing_Spend"])
            .then((result) => ({ tabs: result.tabs, status: result.sourceStatus, read: true }))
            .catch(() => unreadable)
        : unreadable;
      const channelMapping = sheetTabs.tabs["Channel_Mapping"] ?? [];
      const spendRows = sheetTabs.tabs["Marketing_Spend"] ?? [];

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
      // Blended CAC and its LTV ratio are the only metrics here that span both sources,
      // so they are the only ones whose context carries the sheets status. Widening the
      // others would change their readiness for a source they do not read.
      const paidAcquisition = buildPaidAcquisitionViews({
        context: {
          ...metricContext,
          sourceStatuses: sheetTabs.status ? [status, sheetTabs.status] : [status],
        },
        spendRows,
        orderRecords: records,
        ltv90d: views.ltv90d,
        channelMapping,
        channels: context.filters.channels,
        sourceWarnings: status.warningCodes,
        spendSourceReadable: sheetTabs.read,
      });

      return {
        metrics: [
          buildActiveCustomersMetric({
            context: metricContext,
            records,
            sourceWarnings: status.warningCodes,
          }),
          views.metric,
          views.ltv90d,
          paidAcquisition.cac,
          paidAcquisition.ltvCac,
        ],
        tables: [views.cohorts],
        sourceStatuses: sheetTabs.status ? [status, sheetTabs.status] : [status],
        warnings: status.warningCodes,
      };
    },
  };
}

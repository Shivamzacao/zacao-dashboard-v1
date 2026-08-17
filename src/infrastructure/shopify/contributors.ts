import {
  buildBillingGeographyBreakdown,
  buildCustomerCityBreakdown,
  buildCatalogTable,
  buildDetailedOrdersTable,
  buildFulfillmentSummaryBreakdown,
  buildNativeChannelMixBreakdown,
  buildProductMixBreakdown,
  buildCustomerClassificationMetrics,
  buildHistoricalCompletenessMetric,
  buildInventoryBreakdown,
  buildProductSalesBreakdown,
  buildProductUnitsBreakdown,
  buildProductSkuVelocityBreakdown,
  buildProductVelocityTable,
  buildPurchaseHeatmapBreakdown,
  buildRefundRateMetric,
  buildSalesTotalsMetrics,
  buildSalesTrendSeries,
  buildShopifyFunnelMetrics,
  buildShopifyFunnelTable,
  buildShopifySessionEngagementMetric,
  buildTrafficAttributionBreakdown,
} from "@/src/application/metrics";
import type { MetricServiceContext } from "@/src/application/metrics/types";
import type {
  DashboardContribution,
  DashboardDatasetContributor,
  OrchestrationContext,
} from "@/src/application/orchestration";
import type { CachePolicy, SourceStatus } from "@/src/domain/contracts";

import type { ShopifyAdminAdapter } from "./admin-graphql/adapter";
import { buildShopifyHistory, type ShopifyHistory } from "./history";
import {
  mapBillingGeographyFacts,
  mapCustomerCityFacts,
  mapCatalogVariantFacts,
  mapFulfillmentTrendFacts,
  mapNativeChannelFacts,
  mapCustomerClassificationSummary,
  mapReturningCustomerRate,
  mapInventoryFacts,
  mapProductSalesFacts,
  mapProductUnitsFacts,
  mapPurchaseTimingFacts,
  mapSalesTotalsFact,
  mapSalesTrendPoints,
  mapShopifyFunnelFact,
  mapShopifySessionEngagementFact,
  mapTrafficAttributionFacts,
} from "./facts";
import type { ShopifyQlAdapter } from "./shopifyql/adapter";

export interface ShopifyAdapters {
  readonly shopifyql: ShopifyQlAdapter;
  readonly admin: ShopifyAdminAdapter;
  readonly hasReadAllOrders: boolean;
}

export type ShopifyAdapterProvider = () => Promise<ShopifyAdapters>;

const SHOPIFYQL_CACHE: CachePolicy = { freshForSeconds: 300, staleForSeconds: 3_600 };
const ADMIN_CACHE: CachePolicy = { freshForSeconds: 900, staleForSeconds: 86_400 };

function currentStatus(checkedAt: string, history?: ShopifyHistory): SourceStatus {
  return {
    source: "shopify",
    state: "current",
    checkedAt,
    lastSuccessfulAt: checkedAt,
    dataAsOf: checkedAt,
    completeness: history?.completeness ?? "complete",
    warningCodes: history?.warningCodes ? [...history.warningCodes] : [],
  };
}

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

class ShopifyContributor implements DashboardDatasetContributor {
  readonly source = "shopify" as const;

  constructor(
    readonly dataset: string,
    readonly sourceIdentity: string,
    readonly cachePolicy: CachePolicy,
    private readonly loadContribution: (
      context: OrchestrationContext,
    ) => Promise<DashboardContribution>,
  ) {}

  load(context: OrchestrationContext): Promise<DashboardContribution> {
    return this.loadContribution(context);
  }
}

/**
 * Contributors for the currently certifiable Shopify datasets. Adapter access
 * is lazy so the runtime can boot without credentials and report truthful
 * unavailable states instead of crashing at construction time.
 */
export function createShopifyContributors(input: {
  adapters: ShopifyAdapterProvider;
  sourceIdentity: string;
  now: () => Date;
}): readonly DashboardDatasetContributor[] {
  const { adapters, sourceIdentity, now } = input;

  const customers = new ShopifyContributor(
    "shopify-customers",
    sourceIdentity,
    SHOPIFYQL_CACHE,
    async (context) => {
      const { shopifyql } = await adapters();
      // Two provider reads. The grouped dataset gives the new/returning split but
      // cannot give the rate, because summing its groups double-counts a customer
      // who is both inside the period; the ungrouped dataset carries the provider's
      // own rate and the distinct customer total. Neither can be derived from the
      // other, so both are read.
      const [classificationResult, rate] = await Promise.all([
        shopifyql.read({ dataset: "new_returning_customers", dateRange: context.dataPeriod }),
        // The rate read is allowed to fail on its own. The new and returning counts
        // come from the other dataset and are still true, so letting this rejection
        // propagate would blank three metrics to report one missing field. The rate
        // then resolves to null and says so.
        shopifyql
          .read({ dataset: "returning_customer_rate", dateRange: context.dataPeriod })
          .then((result) => mapReturningCustomerRate(result.rows))
          .catch(() => ({ returningRateBasisPoints: null, distinctCustomers: null })),
      ]);
      const status = currentStatus(now().toISOString(), classificationResult.history);
      const summary = mapCustomerClassificationSummary(classificationResult.rows);
      return {
        metrics: buildCustomerClassificationMetrics(
          metricContext(context, [status]),
          summary,
          rate,
        ),
        sourceStatuses: [status],
      };
    },
  );

  const funnel = new ShopifyContributor(
    "shopify-funnel",
    sourceIdentity,
    SHOPIFYQL_CACHE,
    async (context) => {
      const { shopifyql } = await adapters();
      const result = await shopifyql.read({
        dataset: "web_funnel",
        dateRange: context.dataPeriod,
        grain: "month",
      });
      const status = currentStatus(now().toISOString(), result.history);
      const serviceContext = metricContext(context, [status]);
      const fact = mapShopifyFunnelFact(result.rows);
      return {
        metrics: buildShopifyFunnelMetrics(serviceContext, fact),
        tables: [buildShopifyFunnelTable(serviceContext, fact)],
        sourceStatuses: [status],
      };
    },
  );

  const sessionEngagement = new ShopifyContributor(
    "shopify-session-engagement",
    sourceIdentity,
    SHOPIFYQL_CACHE,
    async (context) => {
      const { shopifyql } = await adapters();
      const result = await shopifyql.read({
        dataset: "session_engagement",
        dateRange: context.dataPeriod,
      });
      const status = currentStatus(now().toISOString(), result.history);
      return {
        metrics: [
          buildShopifySessionEngagementMetric(
            metricContext(context, [status]),
            mapShopifySessionEngagementFact(result.rows),
          ),
        ],
        sourceStatuses: [status],
      };
    },
  );

  const trafficAttribution = new ShopifyContributor(
    "shopify-traffic-attribution",
    sourceIdentity,
    SHOPIFYQL_CACHE,
    async (context) => {
      const { shopifyql } = await adapters();
      const result = await shopifyql.read({
        dataset: "traffic_attribution",
        dateRange: context.dataPeriod,
      });
      const status = currentStatus(now().toISOString(), result.history);
      return {
        breakdowns: [
          buildTrafficAttributionBreakdown(
            metricContext(context, [status]),
            mapTrafficAttributionFacts(result.rows),
          ),
        ],
        sourceStatuses: [status],
      };
    },
  );

  const productUnits = new ShopifyContributor(
    "shopify-product-units",
    sourceIdentity,
    SHOPIFYQL_CACHE,
    async (context) => {
      const { shopifyql } = await adapters();
      const trailingEnd = new Date(`${context.dataPeriod.endDate}T00:00:00.000Z`);
      const trailingStart = new Date(trailingEnd);
      trailingStart.setUTCDate(trailingStart.getUTCDate() - 29);
      const trailingRange = {
        startDate: trailingStart.toISOString().slice(0, 10),
        endDate: context.dataPeriod.endDate,
      };
      const [result, trailingResult] = await Promise.all([
        shopifyql.read({
          dataset: "product_line_classification",
          dateRange: context.dataPeriod,
        }),
        shopifyql.read({
          dataset: "product_line_classification",
          dateRange: trailingRange,
        }),
      ]);
      const status = currentStatus(now().toISOString(), result.history);
      const serviceContext = metricContext(context, [status]);
      const periodLabel = `${context.dataPeriod.startDate}..${context.dataPeriod.endDate}`;
      const facts = mapProductUnitsFacts(result.rows, periodLabel);
      const salesFacts = mapProductSalesFacts(result.rows);
      const trailingFacts = mapProductUnitsFacts(trailingResult.rows, "trailing-30-days");
      return {
        breakdowns: [
          buildProductUnitsBreakdown(serviceContext, facts),
          buildProductSkuVelocityBreakdown(serviceContext, trailingFacts),
          buildProductSalesBreakdown(serviceContext, salesFacts),
          buildProductMixBreakdown(serviceContext, salesFacts),
        ],
        tables: [buildProductVelocityTable(serviceContext, facts)],
        sourceStatuses: [status],
      };
    },
  );

  const sales = new ShopifyContributor(
    "shopify-sales",
    sourceIdentity,
    SHOPIFYQL_CACHE,
    async (context) => {
      const { shopifyql } = await adapters();
      // Two provider reads: one canonical aggregate row (totals and AOV are
      // never derived locally) and one monthly timeseries for the trend.
      const [totalsResult, trendResult] = await Promise.all([
        shopifyql.read({ dataset: "sales_totals", dateRange: context.dataPeriod }),
        shopifyql.read({ dataset: "sales_trend", dateRange: context.dataPeriod, grain: "month" }),
      ]);
      const status = currentStatus(now().toISOString(), totalsResult.history);
      const serviceContext = metricContext(context, [status]);
      const totals = mapSalesTotalsFact(totalsResult.rows);
      const points = mapSalesTrendPoints(trendResult.rows);
      return {
        metrics: buildSalesTotalsMetrics(serviceContext, totals),
        series: [
          buildSalesTrendSeries(
            serviceContext,
            points,
            "month",
            totals?.netSalesMinorUnits ?? null,
          ),
        ],
        sourceStatuses: [status],
      };
    },
  );

  const purchaseTiming = new ShopifyContributor(
    "shopify-purchase-timing",
    sourceIdentity,
    SHOPIFYQL_CACHE,
    async (context) => {
      const { shopifyql } = await adapters();
      const result = await shopifyql.read({
        dataset: "purchase_time",
        dateRange: context.dataPeriod,
      });
      const status = currentStatus(now().toISOString(), result.history);
      return {
        breakdowns: [
          buildPurchaseHeatmapBreakdown(
            metricContext(context, [status]),
            mapPurchaseTimingFacts(result.rows),
          ),
        ],
        sourceStatuses: [status],
      };
    },
  );

  const billingGeography = new ShopifyContributor(
    "shopify-geography",
    sourceIdentity,
    SHOPIFYQL_CACHE,
    async (context) => {
      const { shopifyql } = await adapters();
      const result = await shopifyql.read({
        dataset: "billing_geography",
        dateRange: context.dataPeriod,
      });
      const status = currentStatus(now().toISOString(), result.history);
      return {
        breakdowns: [
          buildBillingGeographyBreakdown(
            metricContext(context, [status]),
            mapBillingGeographyFacts(result.rows),
          ),
        ],
        sourceStatuses: [status],
      };
    },
  );

  const customerCity = new ShopifyContributor(
    "shopify-customer-city",
    sourceIdentity,
    SHOPIFYQL_CACHE,
    async (context) => {
      const { shopifyql } = await adapters();
      const result = await shopifyql.read({
        dataset: "billing_city",
        dateRange: context.dataPeriod,
      });
      const status = currentStatus(now().toISOString(), result.history);
      return {
        breakdowns: [
          buildCustomerCityBreakdown(
            metricContext(context, [status]),
            mapCustomerCityFacts(result.rows),
          ),
        ],
        sourceStatuses: [status],
      };
    },
  );

  const catalogInventory = new ShopifyContributor(
    "shopify-catalog-inventory",
    sourceIdentity,
    ADMIN_CACHE,
    async (context) => {
      const { admin, hasReadAllOrders } = await adapters();
      const result = await admin.readProducts({
        dateRange: context.dataPeriod,
        hasReadAllOrders,
      });
      const status = currentStatus(now().toISOString());
      const serviceContext = metricContext(context, [status]);
      const catalogFacts = mapCatalogVariantFacts(result.records);
      const inventoryFacts = mapInventoryFacts(result.records);
      return {
        tables: [buildCatalogTable(serviceContext, catalogFacts)],
        breakdowns: [buildInventoryBreakdown(serviceContext, inventoryFacts)],
        sourceStatuses: [status],
        ...(result.truncated ? { warnings: ["SHOPIFY_CATALOG_TRUNCATED"] } : {}),
      };
    },
  );

  const history = new ShopifyContributor(
    "shopify-history",
    sourceIdentity,
    ADMIN_CACHE,
    async (context) => {
      const { hasReadAllOrders } = await adapters();
      const status = currentStatus(now().toISOString());
      return {
        metrics: [
          buildHistoricalCompletenessMetric(metricContext(context, [status]), {
            mode: "aggregate",
            completeness: "complete",
            requestedStartDate: context.dataPeriod.startDate,
            requestedEndDate: context.dataPeriod.endDate,
            earliestDetailedRecordAt: null,
            warningCodes: hasReadAllOrders ? [] : ["SHOPIFY_DETAILED_HISTORY_PARTIAL"],
          }),
        ],
        sourceStatuses: [status],
      };
    },
  );

  const refunds = new ShopifyContributor(
    "shopify-refund-rate",
    sourceIdentity,
    ADMIN_CACHE,
    async (context) => {
      const { admin, hasReadAllOrders } = await adapters();
      const result = await admin.readOrders({
        dateRange: context.dataPeriod,
        hasReadAllOrders,
      });
      const completeHistory = hasReadAllOrders && !result.truncated;
      const status = currentStatus(
        now().toISOString(),
        buildShopifyHistory({
          mode: "detailed",
          requestedStartDate: context.dataPeriod.startDate,
          requestedEndDate: context.dataPeriod.endDate,
          earliestDetailedRecordAt: result.records.at(-1)?.createdAt ?? null,
          hasReadAllOrders,
          detailedRangeVerified: !result.truncated,
        }),
      );
      return {
        metrics: [
          buildRefundRateMetric(
            metricContext(context, [status]),
            result.records.map((order) => ({
              createdAt: order.createdAt,
              test: order.test,
              cancelledAt: order.cancelledAt,
              refundCount: order.refunds.length,
            })),
            completeHistory,
          ),
        ],
        sourceStatuses: [status],
      };
    },
  );

  // Its own contributor rather than a second view on shopify-refund-rate: that
  // one is planned for Operations Intelligence alone, and the drill-down belongs
  // to Revenue and Customer Intelligence. Sharing it would have dragged an
  // operations metric onto two unrelated pages to get at the order read.
  const detailedOrders = new ShopifyContributor(
    "shopify-detailed-orders",
    sourceIdentity,
    ADMIN_CACHE,
    async (context) => {
      const { admin, hasReadAllOrders } = await adapters();
      const result = await admin.readOrders({
        dateRange: context.dataPeriod,
        hasReadAllOrders,
      });
      const status = currentStatus(
        now().toISOString(),
        buildShopifyHistory({
          mode: "detailed",
          requestedStartDate: context.dataPeriod.startDate,
          requestedEndDate: context.dataPeriod.endDate,
          earliestDetailedRecordAt: result.records.at(-1)?.createdAt ?? null,
          hasReadAllOrders,
          detailedRangeVerified: !result.truncated,
        }),
      );
      return {
        // Test and cancelled orders are excluded so the row count and amounts
        // reconcile with the revenue figures elsewhere on the page.
        tables: [
          buildDetailedOrdersTable(
            metricContext(context, [status]),
            result.records
              .filter((order) => !order.test && order.cancelledAt === null)
              .map((order) => ({
                orderDate: order.createdAt.slice(0, 10),
                channel: order.sourceName,
                amountMinorUnits: order.total.minorUnits,
                quantity: order.quantity,
              })),
          ),
        ],
        sourceStatuses: [status],
        ...(result.truncated ? { warnings: ["SHOPIFY_ORDER_HISTORY_TRUNCATED"] } : {}),
      };
    },
  );

  const channels = new ShopifyContributor(
    "shopify-channels",
    sourceIdentity,
    SHOPIFYQL_CACHE,
    async (context) => {
      const { shopifyql } = await adapters();
      const result = await shopifyql.read({
        dataset: "native_channels",
        dateRange: context.dataPeriod,
      });
      const status = currentStatus(now().toISOString(), result.history);
      const serviceContext = metricContext(context, [status]);
      const facts = mapNativeChannelFacts(result.rows);
      return {
        breakdowns: [buildNativeChannelMixBreakdown(serviceContext, facts)],
        sourceStatuses: [status],
      };
    },
  );

  const fulfillment = new ShopifyContributor(
    "shopify-fulfillment",
    sourceIdentity,
    SHOPIFYQL_CACHE,
    async (context) => {
      const { shopifyql } = await adapters();
      const result = await shopifyql.read({
        dataset: "fulfillment_trend",
        dateRange: context.dataPeriod,
        grain: "month",
      });
      const status = currentStatus(now().toISOString(), result.history);
      return {
        breakdowns: [
          buildFulfillmentSummaryBreakdown(
            metricContext(context, [status]),
            mapFulfillmentTrendFacts(result.rows),
          ),
        ],
        sourceStatuses: [status],
      };
    },
  );

  return [
    customers,
    funnel,
    sessionEngagement,
    trafficAttribution,
    productUnits,
    catalogInventory,
    history,
    refunds,
    detailedOrders,
    sales,
    purchaseTiming,
    billingGeography,
    customerCity,
    channels,
    fulfillment,
  ];
}

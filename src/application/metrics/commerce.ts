import {
  metricBreakdownViewModelSchema,
  metricSeriesViewModelSchema,
  type MetricBreakdownViewModel,
  type MetricSeriesViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import { sumSafeNumbers } from "@/src/domain/metrics/calculations";
import { usd } from "@/src/domain/utilities/money";

import type {
  BillingGeographyFact,
  FulfillmentTrendFact,
  MetricServiceContext,
  NativeChannelFact,
  ProductSalesFact,
  PurchaseTimingFact,
  ShopifySalesTotalsFact,
  ShopifySalesTrendPoint,
} from "./types";
import { buildSkuGroupLabels, isUnmappedSkuKey, skuGroupKey } from "./sku-labels";
import { createMetricViewModel } from "./view-model";

function metric(
  context: MetricServiceContext,
  metricKey: string,
  value: Parameters<typeof createMetricViewModel>[0]["value"],
  warnings: readonly string[] = [],
): MetricViewModel {
  return createMetricViewModel({
    metricKey,
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: context.sourceStatuses,
    value,
    warnings,
  });
}

const money = (minorUnits: number) => ({ kind: "money" as const, value: usd(minorUnits) });

/**
 * DEC-015 revenue policy: every value is the Shopify canonical aggregate for
 * the selected period, passed through verbatim — AOV is never re-divided and
 * discount/return signs are preserved exactly as the provider reports them.
 */
export function buildSalesTotalsMetrics(
  context: MetricServiceContext,
  totals: ShopifySalesTotalsFact | null,
): readonly MetricViewModel[] {
  return [
    metric(context, "commerce.net_sales", totals ? money(totals.netSalesMinorUnits) : null),
    metric(context, "commerce.orders", totals ? { kind: "count", value: totals.orders } : null),
    metric(
      context,
      "commerce.average_order_value",
      totals ? money(totals.averageOrderValueMinorUnits) : null,
    ),
    metric(context, "commerce.gross_sales", totals ? money(totals.grossSalesMinorUnits) : null),
    metric(context, "commerce.discounts", totals ? money(totals.discountsMinorUnits) : null),
    metric(context, "commerce.returns", totals ? money(totals.returnsMinorUnits) : null),
    metric(
      context,
      "commerce.shipping_charges",
      totals ? money(totals.shippingChargesMinorUnits) : null,
    ),
    metric(context, "commerce.taxes", totals ? money(totals.taxesMinorUnits) : null),
    metric(context, "commerce.total_sales", totals ? money(totals.totalSalesMinorUnits) : null),
  ];
}

export function buildSalesTrendSeries(
  context: MetricServiceContext,
  points: readonly ShopifySalesTrendPoint[],
  grain: "day" | "week" | "month",
  periodNetSalesMinorUnits: number | null,
): MetricSeriesViewModel {
  const base = metric(
    context,
    "commerce.sales_trend",
    periodNetSalesMinorUnits === null || points.length === 0
      ? null
      : money(periodNetSalesMinorUnits),
  );
  return metricSeriesViewModelSchema.parse({
    metric: base,
    grain,
    points: points.map((point) => ({
      period: point.period,
      value: money(point.netSalesMinorUnits),
    })),
  });
}

export function buildPurchaseHeatmapBreakdown(
  context: MetricServiceContext,
  facts: readonly PurchaseTimingFact[],
): MetricBreakdownViewModel {
  const totalOrders = sumSafeNumbers(facts.map(({ orders }) => orders));
  const base = metric(
    context,
    "commerce.purchase_heatmap",
    facts.length === 0 ? null : { kind: "count", value: totalOrders },
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "day_hour",
    items: facts.map((fact) => ({
      key: `${fact.dayOfWeek}:${fact.hourOfDay}`,
      label: `${fact.dayOfWeek} ${fact.hourOfDay}`,
      values: [{ kind: "count", value: fact.orders }],
      warnings: [],
    })),
  });
}

export function buildBillingGeographyBreakdown(
  context: MetricServiceContext,
  facts: readonly BillingGeographyFact[],
): MetricBreakdownViewModel {
  const totalOrders = sumSafeNumbers(facts.map(({ orders }) => orders));
  const base = metric(
    context,
    "customers.billing_geography",
    facts.length === 0 ? null : { kind: "count", value: totalOrders },
    ["BILLING_GEOGRAPHY_AGGREGATE_ONLY"],
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "billing_region",
    items: facts.map((fact) => ({
      key: `${fact.country}:${fact.region ?? ""}`,
      label: fact.region ? `${fact.region}, ${fact.country}` : fact.country,
      values: [
        { kind: "count", value: fact.orders },
        { kind: "money", value: usd(fact.totalSalesMinorUnits) },
      ],
      warnings: [],
    })),
  });
}

/** DEC-016: sales_channel values verbatim; blanks stay "Unclassified". */
export function buildNativeChannelMixBreakdown(
  context: MetricServiceContext,
  facts: readonly NativeChannelFact[],
): MetricBreakdownViewModel {
  const totalNetSales = sumSafeNumbers(facts.map(({ netSalesMinorUnits }) => netSalesMinorUnits));
  const hasUnclassified = facts.some(({ channel }) => channel === "Unclassified");
  const base = metric(
    context,
    "commerce.native_channel_mix",
    facts.length === 0 ? null : money(totalNetSales),
    hasUnclassified ? ["UNCLASSIFIED_CHANNEL_PRESENT"] : [],
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "sales_channel",
    items: facts.map((fact) => ({
      key: fact.channel,
      label: fact.channel,
      values: [money(fact.netSalesMinorUnits), { kind: "count", value: fact.orders }],
      warnings: fact.channel === "Unclassified" ? ["UNCLASSIFIED_CHANNEL"] : [],
    })),
  });
}

/** DEC-016: provider fulfillment aggregates, event-dated, coverage disclosed. */
export function buildFulfillmentSummaryBreakdown(
  context: MetricServiceContext,
  facts: readonly FulfillmentTrendFact[],
): MetricBreakdownViewModel {
  const fulfilled = sumSafeNumbers(facts.map(({ ordersFulfilled }) => ordersFulfilled));
  const shipped = sumSafeNumbers(facts.map(({ ordersShipped }) => ordersShipped));
  const delivered = sumSafeNumbers(facts.map(({ ordersDelivered }) => ordersDelivered));
  const base = metric(
    context,
    "operations.fulfillment_summary",
    facts.length === 0 ? null : { kind: "count", value: fulfilled },
    ["CARRIER_EVENT_COVERAGE_VARIES"],
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "fulfillment_status",
    items: [
      {
        key: "fulfilled",
        label: "Fulfilled",
        values: [{ kind: "count", value: fulfilled }],
        warnings: [],
      },
      {
        key: "shipped",
        label: "Shipped",
        values: [{ kind: "count", value: shipped }],
        warnings: [],
      },
      {
        key: "delivered",
        label: "Delivered",
        values: [{ kind: "count", value: delivered }],
        warnings: ["CARRIER_EVENT_COVERAGE_VARIES"],
      },
    ],
  });
}

/** DEC-016 net-sales basis: merchandise share of the merchandise total. */
export function buildProductMixBreakdown(
  context: MetricServiceContext,
  facts: readonly ProductSalesFact[],
): MetricBreakdownViewModel {
  const merchandise = facts.filter(({ merchandise: isMerchandise }) => isMerchandise);
  const grouped = new Map<string, { product: string; variant: string | null; netSales: number }>();
  for (const fact of merchandise) {
    const key = skuGroupKey(fact);
    const existing = grouped.get(key);
    if (existing) {
      existing.netSales += fact.netSalesMinorUnits;
    } else {
      grouped.set(key, {
        product: fact.product,
        variant: fact.variant,
        netSales: fact.netSalesMinorUnits,
      });
    }
  }
  const labels = buildSkuGroupLabels(grouped);
  const total = sumSafeNumbers([...grouped.values()].map(({ netSales }) => netSales));
  // The headline value is the leading SKU's share of merchandise net sales.
  const leadingShare =
    total === 0
      ? null
      : Math.round(
          (Math.max(0, ...[...grouped.values()].map(({ netSales }) => netSales)) * 10_000) / total,
        );
  const base = metric(
    context,
    "products.mix",
    merchandise.length === 0 || leadingShare === null
      ? null
      : { kind: "rate_basis_points", value: leadingShare },
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "sku",
    items: [...grouped.entries()].map(([key, { netSales }]) => ({
      key,
      label: labels.get(key) ?? key,
      values:
        total === 0
          ? [money(netSales)]
          : [
              {
                kind: "rate_basis_points",
                value: Math.round((netSales * 10_000) / total),
              },
              money(netSales),
            ],
      warnings: isUnmappedSkuKey(key) ? ["MISSING_SKU"] : [],
    })),
  });
}

export function buildProductSalesBreakdown(
  context: MetricServiceContext,
  facts: readonly ProductSalesFact[],
): MetricBreakdownViewModel {
  const merchandise = facts.filter(({ merchandise: isMerchandise }) => isMerchandise);
  const grouped = new Map<string, { product: string; variant: string | null; values: number[] }>();
  for (const fact of merchandise) {
    const key = skuGroupKey(fact);
    const existing = grouped.get(key);
    if (existing) {
      existing.values.push(fact.netSalesMinorUnits);
    } else {
      grouped.set(key, {
        product: fact.product,
        variant: fact.variant,
        values: [fact.netSalesMinorUnits],
      });
    }
  }
  const labels = buildSkuGroupLabels(grouped);
  const total = sumSafeNumbers(merchandise.map(({ netSalesMinorUnits }) => netSalesMinorUnits));
  const warnings = facts.length === merchandise.length ? [] : ["NON_MERCHANDISE_ROWS_EXCLUDED"];
  const base = metric(
    context,
    "products.sales",
    merchandise.length === 0 ? null : money(total),
    warnings,
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "sku",
    items: [...grouped.entries()].map(([key, { values }]) => ({
      key,
      label: labels.get(key) ?? key,
      values: [money(sumSafeNumbers(values))],
      warnings: isUnmappedSkuKey(key) ? ["MISSING_SKU"] : [],
    })),
  });
}

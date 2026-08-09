import { HOURS_PER_DAY, WEEKDAY_NAMES, hourLabel } from "@/src/application/metrics/purchase-timing";
import type { MetricDisplayValue } from "@/src/application/view-models";
import type {
  ChartDatum,
  SourceIndicatorModel,
} from "@/src/presentation/components/dashboard/display-contracts";
import type {
  DashboardPageDisplayData,
  DisplayTableRow,
} from "@/src/presentation/features/dashboard-pages/display-data";

export type FixtureTableRow = DisplayTableRow;

export interface F3PageFixtureData extends DashboardPageDisplayData {
  readonly environment: "test";
  readonly synthetic: true;
  readonly currentValues: Readonly<Record<string, MetricDisplayValue>>;
  readonly chartData: Readonly<Record<string, readonly ChartDatum[]>>;
  readonly rowsByDataset: Readonly<Record<string, readonly FixtureTableRow[]>>;
  readonly sources: readonly SourceIndicatorModel[];
}

/**
 * The purchase heatmap renders a dense weekday x hour grid, so the synthetic
 * fixture mirrors that shape rather than a handful of sample cells. Weights are
 * a fixed retail-shaped curve — deterministic, and obviously not real data.
 */
function purchaseHeatmapFixture(): readonly ChartDatum[] {
  const weekdayWeight = [0.7, 0.9, 1, 1.05, 1.2, 1.4, 0.85];
  const hourWeight = [
    1, 1, 0, 0, 0, 1, 2, 4, 6, 9, 12, 14, 15, 13, 11, 10, 11, 13, 16, 18, 15, 10, 6, 3,
  ];
  return WEEKDAY_NAMES.flatMap((day, dayIndex) =>
    Array.from({ length: HOURS_PER_DAY }, (_unused, hour) => ({
      key: `${dayIndex}:${hour}`,
      group: day,
      label: hourLabel(hour),
      value: Math.round((weekdayWeight[dayIndex] ?? 1) * (hourWeight[hour] ?? 0)),
    })),
  );
}

export const f3PageFixtureData: F3PageFixtureData = Object.freeze({
  environment: "test",
  synthetic: true,
  currentValues: Object.freeze({
    // DEC-015 activated the canonical revenue pass-through metrics; these are
    // explicitly synthetic TEST values shaped like the provider aggregates.
    "commerce.net_sales": { kind: "money", value: { currency: "USD", minorUnits: 1_425_000 } },
    "commerce.orders": { kind: "count", value: 128 },
    "commerce.average_order_value": {
      kind: "money",
      value: { currency: "USD", minorUnits: 11_133 },
    },
    "commerce.gross_sales": { kind: "money", value: { currency: "USD", minorUnits: 1_580_000 } },
    "commerce.discounts": { kind: "money", value: { currency: "USD", minorUnits: -95_000 } },
    "commerce.returns": { kind: "money", value: { currency: "USD", minorUnits: -60_000 } },
    "commerce.total_sales": { kind: "money", value: { currency: "USD", minorUnits: 1_447_500 } },
    "commerce.sales_trend": { kind: "money", value: { currency: "USD", minorUnits: 1_425_000 } },
    "commerce.purchase_heatmap": { kind: "count", value: 128 },
    "products.sales": { kind: "money", value: { currency: "USD", minorUnits: 1_425_000 } },
    "customers.billing_geography": { kind: "count", value: 120 },
    // DEC-016 activated channel, fulfillment, and product-mix defaults.
    "commerce.native_channel_mix": {
      kind: "money",
      value: { currency: "USD", minorUnits: 1_425_000 },
    },
    "operations.fulfillment_summary": { kind: "count", value: 118 },
    // Delivered is the headline; the shipped/delivered gap is in the breakdown.
    "operations.shipped_delivered": { kind: "count", value: 96 },
    "operations.fulfillment_trend": { kind: "count", value: 118 },
    "products.mix": { kind: "rate_basis_points", value: 4_100 },
    "quality.unclassified_channel": { kind: "count", value: 3 },
    "customers.returning_rate": { kind: "rate_basis_points", value: 3840 },
    "customers.new_count": { kind: "count", value: 41 },
    "customers.returning_count": { kind: "count", value: 26 },
    "products.units_sold": { kind: "count", value: 128 },
    "products.units_velocity": { kind: "count", value: 128 },
    // Available-only, matching buildInventoryBreakdown: the overlapping states
    // below are shown but never summed into this headline.
    "inventory.shopify_current": { kind: "count", value: 208 },
    "quality.missing_sku_cost": { kind: "count", value: 1 },
    "commerce.web_funnel": { kind: "count", value: 18 },
    "sources.freshness": { kind: "status", value: "3 sources checked" },
    "sources.historical_completeness": { kind: "status", value: "Partial history disclosed" },
    "quality.klaviyo_no_activity": { kind: "status", value: "No activity" },
    "quality.sop_validation": { kind: "status", value: "Source pending" },
  } as const),
  chartData: Object.freeze({
    "commerce.native_channel_mix": [
      { key: "online", label: "Online Store", value: 11800 },
      { key: "pos", label: "Point of Sale", value: 1900 },
      { key: "unclassified", label: "Unclassified", value: 550 },
    ],
    "operations.fulfillment_summary": [
      { key: "fulfilled", label: "Fulfilled", value: 118 },
      { key: "shipped", label: "Shipped", value: 112 },
      { key: "delivered", label: "Delivered", value: 96 },
    ],
    "operations.shipped_delivered": [
      { key: "shipped", label: "Shipped", value: 112 },
      { key: "delivered", label: "Delivered", value: 96 },
    ],
    "operations.fulfillment_trend": [
      { key: "2026-05", label: "May", value: 36 },
      { key: "2026-06", label: "Jun", value: 41 },
      { key: "2026-07", label: "Jul", value: 41 },
    ],
    "products.mix": [
      { key: "dark", label: "Dark 70%", value: 41 },
      { key: "smooth", label: "Smooth 42%", value: 37 },
      { key: "gift", label: "Gift pack", value: 22 },
    ],
    "commerce.sales_trend": [
      { key: "may", label: "May", value: 4200 },
      { key: "jun", label: "Jun", value: 4850 },
      { key: "jul", label: "Jul", value: 5200 },
    ],
    "commerce.purchase_heatmap": purchaseHeatmapFixture(),
    "products.sales": [
      { key: "dark", label: "Dark 70%", value: 6400 },
      { key: "smooth", label: "Smooth 42%", value: 5300 },
      { key: "gift", label: "Gift pack", value: 2550 },
    ],
    "customers.billing_geography": [
      { key: "ny", label: "New York, United States", value: 64 },
      { key: "ca", label: "California, United States", value: 31 },
      { key: "on", label: "Ontario, Canada", value: 25 },
    ],
    "products.units_sold": [
      { key: "dark", label: "Dark 70%", value: 52 },
      { key: "smooth", label: "Smooth 42%", value: 44 },
      { key: "gift", label: "Gift pack", value: 32 },
    ],
    // Location · SKU · quantity-state, as buildInventoryBreakdown emits. The
    // available rows (112 + 96) are the headline; on_hand overlaps them.
    "inventory.shopify_current": [
      {
        key: "snapl:SYNTH-DARK-70:available",
        label: "SNAPL · SYNTH-DARK-70 · available",
        value: 112,
      },
      { key: "snapl:SYNTH-DARK-70:on_hand", label: "SNAPL · SYNTH-DARK-70 · on_hand", value: 118 },
      {
        key: "snapl:SYNTH-SMOOTH-42:available",
        label: "SNAPL · SYNTH-SMOOTH-42 · available",
        value: 96,
      },
      {
        key: "snapl:SYNTH-SMOOTH-42:on_hand",
        label: "SNAPL · SYNTH-SMOOTH-42 · on_hand",
        value: 104,
      },
    ],
    "customers.new_count": [
      { key: "may", label: "May", value: 30, secondaryValue: 18 },
      { key: "jun", label: "Jun", value: 35, secondaryValue: 22 },
      { key: "jul", label: "Jul", value: 41, secondaryValue: 26 },
    ],
    "commerce.web_funnel": [
      { key: "sessions", label: "Sessions", value: 1280 },
      { key: "cart", label: "Added to cart", value: 174 },
      { key: "checkout", label: "Reached checkout", value: 86 },
      { key: "purchase", label: "Purchased", value: 18 },
    ],
    "sources.freshness": [
      { key: "shopify", label: "Shopify", value: 100 },
      { key: "klaviyo", label: "Klaviyo", value: 0 },
      { key: "sheets", label: "Google Sheets", value: 0 },
    ],
  }),
  // The funnel plots stage counts while its metric's own value is a conversion
  // rate; without this the counts would render as percentages.
  chartValueFormats: Object.freeze({ "commerce.web_funnel": "count" as const }),
  rowsByDataset: Object.freeze({
    "product-catalog": [
      { product: "Synthetic Dark Bar", sku: "SYNTH-DARK-70", status: "Active", price: "$12.00" },
      {
        product: "Synthetic Smooth Bar",
        sku: "SYNTH-SMOOTH-42",
        status: "Active",
        price: "$12.00",
      },
      { product: "Synthetic Gift Pack", sku: "SYNTH-GIFT-01", status: "Active", price: "$36.00" },
    ],
    // Mirrors buildProductVelocityTable's contract exactly: observed units per
    // provider reporting period. There is no per-day rate column, because the
    // provider period is a range label and a derived daily rate would read as
    // the inventory-planning velocity that stays BUSINESS_RULE_REQUIRED.
    "product-velocity": [
      {
        period: "2025-08-01..2026-07-31",
        product: "Synthetic Dark Bar",
        variant: "10 Pack",
        sku: "SYNTH-DARK-70",
        units: 52,
      },
      {
        period: "2025-08-01..2026-07-31",
        product: "Synthetic Smooth Bar",
        variant: "10 Pack",
        sku: "SYNTH-SMOOTH-42",
        units: 44,
      },
      {
        period: "2025-08-01..2026-07-31",
        product: "Synthetic Gift Pack",
        variant: "Single",
        sku: "SYNTH-GIFT-01",
        units: 32,
      },
    ],
  }),
  sources: [
    {
      label: "Shopify",
      state: "current",
      dataAsOf: "2026-07-31T23:59:59.000Z",
      detail: "Synthetic TEST fixture · read-only contract",
    },
    {
      label: "Klaviyo",
      state: "no_activity",
      dataAsOf: null,
      detail: "Future-ready adapter; live activity not asserted",
    },
    {
      label: "Google Sheets",
      state: "data_pending",
      dataAsOf: null,
      detail: "Conditional workbook records not asserted",
    },
  ] as const,
});

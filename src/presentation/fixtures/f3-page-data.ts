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
    "products.mix": { kind: "rate_basis_points", value: 4_100 },
    "quality.unclassified_channel": { kind: "count", value: 3 },
    "customers.returning_rate": { kind: "rate_basis_points", value: 3840 },
    "customers.new_count": { kind: "count", value: 41 },
    "customers.returning_count": { kind: "count", value: 26 },
    "products.units_sold": { kind: "count", value: 128 },
    "products.units_velocity": { kind: "quantity", value: 4.3 },
    "inventory.shopify_current": { kind: "quantity", value: 436 },
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
    "commerce.purchase_heatmap": [
      { key: "Friday:13", label: "13", value: 18, group: "Friday" },
      { key: "Friday:14", label: "14", value: 12, group: "Friday" },
      { key: "Friday:19", label: "19", value: 9, group: "Friday" },
      { key: "Saturday:10", label: "10", value: 24, group: "Saturday" },
      { key: "Saturday:11", label: "11", value: 20, group: "Saturday" },
      { key: "Saturday:20", label: "20", value: 7, group: "Saturday" },
      { key: "Sunday:9", label: "9", value: 6, group: "Sunday" },
      { key: "Sunday:16", label: "16", value: 15, group: "Sunday" },
      { key: "Sunday:21", label: "21", value: 5, group: "Sunday" },
      { key: "Monday:8", label: "8", value: 4, group: "Monday" },
      { key: "Monday:12", label: "12", value: 11, group: "Monday" },
      { key: "Wednesday:13", label: "13", value: 8, group: "Wednesday" },
    ],
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
    "inventory.shopify_current": [
      { key: "dark", label: "Dark 70%", value: 182 },
      { key: "smooth", label: "Smooth 42%", value: 164 },
      { key: "gift", label: "Gift pack", value: 90 },
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
    "product-velocity": [
      { sku: "SYNTH-DARK-70", units: 52, days: 30, dailyVelocity: 1.73 },
      { sku: "SYNTH-SMOOTH-42", units: 44, days: 30, dailyVelocity: 1.47 },
      { sku: "SYNTH-GIFT-01", units: 32, days: 30, dailyVelocity: 1.07 },
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

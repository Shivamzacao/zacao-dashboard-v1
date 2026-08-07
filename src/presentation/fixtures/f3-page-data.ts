import type { MetricDisplayValue } from "@/src/application/view-models";
import type {
  ChartDatum,
  SourceIndicatorModel,
} from "@/src/presentation/components/dashboard/display-contracts";

export type FixtureTableRow = Record<string, string | number | boolean | null>;

export interface F3PageFixtureData {
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

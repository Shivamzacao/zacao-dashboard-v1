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
    "revenue.dtc_total": {
      kind: "money",
      value: { currency: "USD", minorUnits: 1_026_000 },
    },
    "revenue.retail_total": {
      kind: "money",
      value: { currency: "USD", minorUnits: 375_000 },
    },
    "revenue.channel_mix": {
      kind: "money",
      value: { currency: "USD", minorUnits: 1_425_000 },
    },
    "operations.fulfillment_summary": { kind: "count", value: 118 },
    "products.mix": { kind: "rate_basis_points", value: 4_100 },
    "quality.unclassified_channel": { kind: "count", value: 3 },
    "customers.returning_rate": { kind: "rate_basis_points", value: 3840 },
    "customers.new_count": { kind: "count", value: 41 },
    "customers.returning_count": { kind: "count", value: 26 },
    "customers.active": { kind: "count", value: 187 },
    "customers.realized_ltv": {
      kind: "money",
      value: { currency: "USD", minorUnits: 18_640 },
    },
    "customers.realized_ltv_cohorts": {
      kind: "money",
      value: { currency: "USD", minorUnits: 18_640 },
    },
    "engagement.time_on_site": { kind: "duration_seconds", value: 192 },
    "customers.geo_city": { kind: "count", value: 120 },
    "customers.age_mix": { kind: "rate_basis_points", value: 10_000 },
    "customers.sex_mix": { kind: "rate_basis_points", value: 10_000 },
    "products.units_sold": { kind: "count", value: 128 },
    "products.units_velocity": { kind: "quantity", value: 4.3 },
    "inventory.shopify_current": { kind: "quantity", value: 436 },
    "quality.missing_sku_cost": { kind: "count", value: 1 },
    "commerce.web_funnel": { kind: "count", value: 18 },
    "commerce.website_sessions": { kind: "count", value: 1280 },
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
    "revenue.channel_mix": [
      { key: "site", label: "DTC — Site", value: 5980 },
      { key: "wholesale", label: "Wholesale / Faire", value: 2180 },
      { key: "tiktok", label: "TikTok Shop", value: 1420 },
      { key: "affiliate", label: "DTC — Affiliate", value: 1240 },
      { key: "distribution", label: "In-store — Distribution", value: 1010 },
      { key: "shopmy", label: "ShopMy", value: 860 },
      { key: "ig", label: "IG Shop", value: 760 },
      { key: "cafes", label: "In-store — Cafés", value: 560 },
      { key: "events", label: "Events / Pop-ups", value: 240 },
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
    "customers.realized_ltv_cohorts": [
      {
        key: "2026-03",
        label: "Mar 2026",
        value: 186.4,
        seriesValues: {
          ltv30d: 82.4,
          ltv60d: 114.2,
          ltv90d: 142.8,
          ltv180d: null,
          lifetime: 186.4,
        },
      },
      {
        key: "2026-04",
        label: "Apr 2026",
        value: 168.2,
        seriesValues: {
          ltv30d: 76.8,
          ltv60d: 108.6,
          ltv90d: 137.4,
          ltv180d: null,
          lifetime: 168.2,
        },
      },
      {
        key: "2026-05",
        label: "May 2026",
        value: 149.6,
        seriesValues: { ltv30d: 71.2, ltv60d: 101.5, ltv90d: null, ltv180d: null, lifetime: 149.6 },
      },
    ],
    "customers.geo_city": [
      { key: "nyc", label: "New York, NY", value: 38 },
      { key: "bk", label: "Brooklyn, NY", value: 26 },
      { key: "la", label: "Los Angeles, CA", value: 19 },
      { key: "to", label: "Toronto, ON", value: 15 },
      { key: "sf", label: "San Francisco, CA", value: 12 },
      { key: "chi", label: "Chicago, IL", value: 6 },
      { key: "atx", label: "Austin, TX", value: 4 },
    ],
    "customers.age_mix": [
      { key: "25", label: "25–34", value: 41 },
      { key: "35", label: "35–44", value: 27 },
      { key: "18", label: "18–24", value: 14 },
      { key: "45", label: "45–54", value: 12 },
      { key: "55", label: "55+", value: 6 },
    ],
    "customers.sex_mix": [
      { key: "f", label: "Female", value: 63 },
      { key: "m", label: "Male", value: 34 },
      { key: "u", label: "Undisclosed", value: 3 },
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
  chartValueFormats: Object.freeze({
    "commerce.web_funnel": "count" as const,
    "sources.freshness": "percent" as const,
  }),
  rowsByDataset: Object.freeze({
    "channel-performance": [
      {
        channel: "DTC — Site",
        revenueMinorUnits: 598_000,
        orders: 54,
        averageOrderValueMinorUnits: 11_074,
        marginBasisPoints: null,
      },
      {
        channel: "Wholesale / Faire",
        revenueMinorUnits: 218_000,
        orders: 9,
        averageOrderValueMinorUnits: 24_222,
        marginBasisPoints: null,
      },
      {
        channel: "TikTok Shop",
        revenueMinorUnits: 142_000,
        orders: 16,
        averageOrderValueMinorUnits: 8_875,
        marginBasisPoints: null,
      },
      {
        channel: "DTC — Affiliate",
        revenueMinorUnits: 124_000,
        orders: 12,
        averageOrderValueMinorUnits: 10_333,
        marginBasisPoints: null,
      },
      {
        channel: "In-store — Distribution",
        revenueMinorUnits: 101_000,
        orders: 5,
        averageOrderValueMinorUnits: 20_200,
        marginBasisPoints: null,
      },
      {
        channel: "ShopMy",
        revenueMinorUnits: 86_000,
        orders: 8,
        averageOrderValueMinorUnits: 10_750,
        marginBasisPoints: null,
      },
      {
        channel: "IG Shop",
        revenueMinorUnits: 76_000,
        orders: 9,
        averageOrderValueMinorUnits: 8_444,
        marginBasisPoints: null,
      },
      {
        channel: "In-store — Cafés",
        revenueMinorUnits: 56_000,
        orders: 11,
        averageOrderValueMinorUnits: 5_091,
        marginBasisPoints: null,
      },
      {
        channel: "Events / Pop-ups",
        revenueMinorUnits: 24_000,
        orders: 4,
        averageOrderValueMinorUnits: 6_000,
        marginBasisPoints: null,
      },
    ],
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

export const f3CustomerPageFixtureData: F3PageFixtureData = Object.freeze({
  ...f3PageFixtureData,
  currentValues: Object.freeze({
    ...f3PageFixtureData.currentValues,
    "klaviyo.email_open_rate": { kind: "rate_basis_points" as const, value: 4_120 },
    "klaviyo.campaign_performance": { kind: "status" as const, value: "5 report rows" },
  }),
  rowsByDataset: Object.freeze({
    ...f3PageFixtureData.rowsByDataset,
    "klaviyo-campaigns": [
      {
        id: "welcome-flow",
        name: "Welcome flow",
        channel: "email",
        recipients: 412,
        deliveryRateBasisPoints: 9_820,
        openRateBasisPoints: 5_280,
        clickRateBasisPoints: 610,
        conversions: 12,
        conversionValueMinorUnits: 94_000,
      },
      {
        id: "origin-story-ghana",
        name: "Origin Story · Ghana",
        channel: "email",
        recipients: 2_840,
        deliveryRateBasisPoints: 9_740,
        openRateBasisPoints: 4_820,
        clickRateBasisPoints: 440,
        conversions: 18,
        conversionValueMinorUnits: 118_000,
      },
      {
        id: "matcha-launch",
        name: "Matcha launch",
        channel: "email",
        recipients: 2_610,
        deliveryRateBasisPoints: 9_710,
        openRateBasisPoints: 4_460,
        clickRateBasisPoints: 390,
        conversions: 9,
        conversionValueMinorUnits: 62_000,
      },
      {
        id: "summer-gifting",
        name: "Summer gifting",
        channel: "email",
        recipients: 2_480,
        deliveryRateBasisPoints: 9_690,
        openRateBasisPoints: 3_910,
        clickRateBasisPoints: 280,
        conversions: 5,
        conversionValueMinorUnits: 31_000,
      },
      {
        id: "restock-dark-70",
        name: "Restock · Dark 70%",
        channel: "email",
        recipients: 1_960,
        deliveryRateBasisPoints: 9_660,
        openRateBasisPoints: 3_640,
        clickRateBasisPoints: 210,
        conversions: 2,
        conversionValueMinorUnits: 13_000,
      },
    ],
  }),
});

export const f3ProductPageFixtureData: F3PageFixtureData = Object.freeze({
  ...f3PageFixtureData,
  alerts: [
    {
      key: "synthetic-matcha-cogs-risk",
      severity: "danger" as const,
      title: "Matcha 60% COGS is trending above target",
      description:
        "Landed cost is $1.71 a bar against a $1.45 target. Matcha input cost is up 18% quarter over quarter, holding SKU margin at 43% against 61% for Dark 70%.",
      metadata: ["SKU cost risk", "SYNTH-MATCHA-60"],
    },
  ],
  currentValues: Object.freeze({
    ...f3PageFixtureData.currentValues,
    "products.sku_velocity": { kind: "quantity" as const, value: 4.3 },
    "inventory.on_hand_bars": { kind: "quantity" as const, value: 436 },
    "inventory.value": {
      kind: "money" as const,
      value: { currency: "USD" as const, minorUnits: 78_480 },
    },
    "inventory.sell_through": { kind: "rate_basis_points" as const, value: 2_270 },
    "inventory.weeks_cover": { kind: "quantity" as const, value: 7.4 },
    "products.cogs_flags": { kind: "count" as const, value: 1 },
    "manufacturing.cogs_per_bar": {
      kind: "money" as const,
      value: { currency: "USD" as const, minorUnits: 142 },
    },
    "products.sku_margin": { kind: "rate_basis_points" as const, value: 6_400 },
    "inventory.sku_stock": { kind: "quantity" as const, value: 436 },
    "manufacturing.cogs_trend": {
      kind: "money" as const,
      value: { currency: "USD" as const, minorUnits: 142 },
    },
  }),
  chartData: Object.freeze({
    ...f3PageFixtureData.chartData,
    "inventory.on_hand_bars": [
      { key: "dark", label: "Dark 70%", value: 182 },
      { key: "smooth", label: "Smooth 42%", value: 164 },
      { key: "matcha", label: "Matcha 60%", value: 46 },
      { key: "gift", label: "Gift pack", value: 44 },
    ],
    "products.sku_velocity": [
      { key: "dark", label: "Dark 70% · SYNTH-DARK-70", value: 1.73 },
      { key: "smooth", label: "Smooth 42% · SYNTH-SMOOTH-42", value: 1.47 },
      { key: "gift", label: "Gift pack · SYNTH-GIFT-01", value: 1.07 },
    ],
    "products.sales": [
      { key: "dark", label: "Dark 70%", value: 5_240 },
      { key: "smooth", label: "Smooth 42%", value: 4_180 },
      { key: "matcha", label: "Matcha 60%", value: 2_610 },
      { key: "gift", label: "Gift pack", value: 2_220 },
    ],
    "products.sku_margin": [
      { key: "smooth", label: "Smooth 42%", value: 64 },
      { key: "dark", label: "Dark 70%", value: 61 },
      { key: "gift", label: "Gift pack", value: 57 },
      { key: "matcha", label: "Matcha 60%", value: 43 },
    ],
    "inventory.sku_stock": [
      { key: "dark", label: "Dark 70%", value: 182, minValue: 120, maxValue: 260 },
      { key: "smooth", label: "Smooth 42%", value: 164, minValue: 120, maxValue: 260 },
      { key: "matcha", label: "Matcha 60%", value: 46, minValue: 110, maxValue: 240 },
      { key: "gift", label: "Gift pack", value: 44, minValue: 35, maxValue: 95 },
    ],
    "manufacturing.cogs_trend": [
      { key: "feb", label: "Feb", value: 1.58, secondaryValue: 1.35 },
      { key: "mar", label: "Mar", value: 1.52, secondaryValue: 1.35 },
      { key: "apr", label: "Apr", value: 1.49, secondaryValue: 1.35 },
      { key: "may", label: "May", value: 1.46, secondaryValue: 1.35 },
      { key: "jun", label: "Jun", value: 1.44, secondaryValue: 1.35 },
      { key: "jul", label: "Jul", value: 1.42, secondaryValue: 1.35 },
    ],
  }),
  rowsByDataset: Object.freeze({
    ...f3PageFixtureData.rowsByDataset,
    "product-catalog": [
      { product: "Dark 70%", sku: "SYNTH-DARK-70", status: "Active", price: "$12.00" },
      { product: "Smooth 42%", sku: "SYNTH-SMOOTH-42", status: "Active", price: "$12.00" },
      { product: "Matcha 60%", sku: "SYNTH-MATCHA-60", status: "Active", price: "$14.00" },
      { product: "Gift pack", sku: "SYNTH-GIFT-01", status: "Active", price: "$36.00" },
    ],
    "sku-margin": [
      {
        sku: "SYNTH-DARK-70",
        units: 52,
        revenueMinorUnits: 524_000,
        cogsPerBarMinorUnits: 138,
        targetPerBarMinorUnits: 135,
        marginBasisPoints: 6_100,
        status: "On target",
      },
      {
        sku: "SYNTH-SMOOTH-42",
        units: 44,
        revenueMinorUnits: 418_000,
        cogsPerBarMinorUnits: 131,
        targetPerBarMinorUnits: 135,
        marginBasisPoints: 6_400,
        status: "On target",
      },
      {
        sku: "SYNTH-MATCHA-60",
        units: 21,
        revenueMinorUnits: 261_000,
        cogsPerBarMinorUnits: 171,
        targetPerBarMinorUnits: 145,
        marginBasisPoints: 4_300,
        status: "Above target",
      },
      {
        sku: "SYNTH-GIFT-01",
        units: 11,
        revenueMinorUnits: 222_000,
        cogsPerBarMinorUnits: 410,
        targetPerBarMinorUnits: 420,
        marginBasisPoints: 5_700,
        status: "On target",
      },
    ],
  }),
});

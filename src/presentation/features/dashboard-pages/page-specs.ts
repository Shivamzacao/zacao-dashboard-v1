import type { DashboardSlug } from "@/src/application/api";
import type { ChartSeriesDefinition } from "@/src/presentation/components/dashboard/display-contracts";

export type ChartKind =
  "line" | "area" | "bar" | "horizontal" | "stacked" | "donut" | "funnel" | "heatmap";

export interface PageKpiSpec {
  readonly metricKey: string;
  readonly label?: string;
  readonly sourceLabel?: string;
  readonly valuePresentation?: "default" | "full" | "ratio";
  readonly unitSuffix?: string;
}

export interface PageChartSpec {
  readonly title: string;
  readonly description: string;
  readonly metricKey: string;
  readonly kind: ChartKind;
  readonly eyebrow?: string;
  readonly sourceLabel?: string;
  readonly secondaryMetricKey?: string;
  readonly series?: readonly ChartSeriesDefinition[];
}

export interface PageTableSpec {
  readonly title: string;
  readonly description: string;
  readonly coverageNote?: string;
  readonly metricKey: string;
  readonly sourceLabel?: string;
  readonly dataset?: string;
  readonly hiddenColumns?: readonly string[];
  readonly columnOrder?: readonly string[];
  readonly columnLabels?: Readonly<Record<string, string>>;
}

export interface DashboardPageSpec {
  readonly slug: DashboardSlug;
  readonly kpis: readonly PageKpiSpec[];
  readonly charts: readonly PageChartSpec[];
  readonly tables: readonly PageTableSpec[];
}

type DashboardPageSpecInput = Omit<DashboardPageSpec, "kpis"> & {
  readonly kpis: readonly (string | PageKpiSpec)[];
};

const spec = (value: DashboardPageSpecInput): DashboardPageSpec =>
  Object.freeze({
    ...value,
    kpis: Object.freeze(
      value.kpis.map((item) => (typeof item === "string" ? { metricKey: item } : item)),
    ),
  });

export const dashboardPageSpecs: Readonly<Record<DashboardSlug, DashboardPageSpec>> = Object.freeze(
  {
    executive: spec({
      slug: "executive",
      kpis: [
        { metricKey: "commerce.net_sales", valuePresentation: "full" },
        { metricKey: "commerce.orders", valuePresentation: "full" },
        { metricKey: "commerce.average_order_value", valuePresentation: "full" },
        { metricKey: "customers.returning_rate", valuePresentation: "full" },
        {
          metricKey: "marketing.ltv_cac",
          label: "LTV:CAC",
          sourceLabel: "Shopify + Google Sheets",
          valuePresentation: "ratio",
        },
        { metricKey: "commerce.website_sessions", valuePresentation: "full" },
        {
          metricKey: "inventory.combined",
          label: "Inventory on hand",
          sourceLabel: "Shopify + 3PL",
          valuePresentation: "full",
          unitSuffix: "bars",
        },
        {
          metricKey: "operations.manufacturer_otif",
          label: "On-time & complete (manufacturer)",
          sourceLabel: "Google Sheets",
          valuePresentation: "full",
        },
        {
          metricKey: "manufacturing.cogs_per_bar",
          label: "COGS per bar",
          sourceLabel: "Fairafric",
          valuePresentation: "full",
        },
      ],
      charts: [
        {
          title: "Sales momentum",
          description: "Approved net-sales trend for the selected period.",
          metricKey: "commerce.sales_trend",
          kind: "area",
        },
        {
          title: "Fulfillment health",
          description: "Provider fulfillment statuses under the approved status policy.",
          metricKey: "operations.fulfillment_summary",
          kind: "horizontal",
        },
        {
          title: "Units sold",
          description: "Net merchandise items sold by approved product.",
          metricKey: "products.units_sold",
          eyebrow: "Units sold",
          kind: "horizontal",
        },
        {
          title: "Product revenue",
          description: "Approved merchandise revenue by product.",
          metricKey: "products.sales",
          eyebrow: "Product/SKU sales",
          kind: "horizontal",
        },
        {
          title: "Source readiness",
          description: "Freshness evidence for each connected source.",
          metricKey: "sources.freshness",
          eyebrow: "Source freshness",
          sourceLabel: "Shopify + Klaviyo + Google Sheets",
          kind: "bar",
        },
        {
          title: "Revenue mix by channel",
          description: "Net sales across the approved ZACAO channel taxonomy.",
          metricKey: "commerce.native_channel_mix",
          eyebrow: "Revenue by channel",
          kind: "horizontal",
        },
        {
          title: "Per-bar COGS versus target",
          description: "Landed manufacturing cost per bar against the approved target.",
          metricKey: "manufacturing.cogs_per_bar",
          eyebrow: "Per-bar COGS trend",
          sourceLabel: "Fairafric",
          kind: "line",
          series: [
            { key: "value", label: "Actual COGS", tone: "forest" },
            { key: "secondaryValue", label: "Target", tone: "gold", pattern: "dashed" },
          ],
        },
        {
          title: "Input cost movement",
          description: "Quarter-over-quarter movement in each major input cost.",
          metricKey: "manufacturing.input_cost_movement",
          eyebrow: "Input cost movement",
          sourceLabel: "Fairafric",
          kind: "horizontal",
        },
        {
          title: "Manufacturer delivery performance",
          description: "On-time, complete, and damage-free rates for received purchase orders.",
          metricKey: "operations.manufacturer_otif",
          eyebrow: "Manufacturer delivery performance",
          sourceLabel: "Google Sheets",
          kind: "horizontal",
        },
        {
          title: "Inventory on hand by channel",
          description: "Sellable units grouped by the channel each location serves.",
          metricKey: "inventory.combined",
          eyebrow: "Inventory on hand by channel",
          sourceLabel: "Shopify + 3PL",
          kind: "horizontal",
        },
      ],
      tables: [],
    }),
    revenue: spec({
      slug: "revenue",
      kpis: [
        "commerce.gross_sales",
        "commerce.discounts",
        "commerce.returns",
        "commerce.total_sales",
        "commerce.orders",
        "commerce.average_order_value",
        {
          metricKey: "revenue.dtc_total",
          label: "DTC revenue (total)",
          sourceLabel: "Shopify",
          valuePresentation: "full",
        },
        {
          metricKey: "revenue.retail_total",
          label: "Wholesale & in-store revenue",
          sourceLabel: "Shopify + Faire",
          valuePresentation: "full",
        },
      ],
      charts: [
        {
          title: "Revenue trend",
          description: "Net-sales movement across the selected reporting period.",
          metricKey: "commerce.sales_trend",
          kind: "line",
        },
        {
          title: "Units sold",
          description: "Net merchandise items sold by approved product.",
          metricKey: "products.units_sold",
          kind: "bar",
        },
        {
          title: "Purchase timing",
          description: "Qualifying orders by New York reporting day and hour.",
          metricKey: "commerce.purchase_heatmap",
          kind: "heatmap",
        },
        {
          title: "Revenue mix by channel",
          description: "Net sales across the approved ZACAO channel taxonomy.",
          metricKey: "revenue.channel_mix",
          eyebrow: "Revenue by channel",
          sourceLabel: "Shopify + Google Sheets",
          kind: "horizontal",
        },
        {
          title: "Margin by channel",
          description: "Contribution margin after landed COGS, channel fees, and commission.",
          metricKey: "revenue.channel_margin",
          eyebrow: "Contribution margin by channel",
          sourceLabel: "Shopify + mapping / cost sources",
          kind: "horizontal",
        },
        {
          title: "Sales by SKU",
          description: "Merchandise net sales grouped by canonical SKU.",
          metricKey: "products.sales",
          eyebrow: "Sales by SKU",
          sourceLabel: "Shopify",
          kind: "horizontal",
        },
      ],
      tables: [
        {
          title: "Detailed orders",
          description: "Order-level detail depends on complete approved Shopify history.",
          metricKey: "commerce.detailed_order_drilldown",
          dataset: "detailed-orders",
        },
        {
          title: "Channel performance",
          description: "Revenue, orders, margin, and average order value by channel.",
          coverageNote:
            "Margin is unavailable until landed COGS, channel-fee, and commission rules are approved. Revenue, orders, and AOV remain certified.",
          metricKey: "revenue.channel_mix",
          sourceLabel: "Shopify + Google Sheets",
          dataset: "channel-performance",
        },
      ],
    }),
    customers: spec({
      slug: "customers",
      kpis: [
        "customers.new_count",
        "customers.returning_count",
        "customers.returning_rate",
        "customers.active",
        "customers.realized_ltv",
        {
          metricKey: "engagement.time_on_site",
          label: "Time on site",
          sourceLabel: "Shopify",
          valuePresentation: "full",
        },
        {
          metricKey: "marketing.cac",
          sourceLabel: "Shopify + Google Sheets",
          valuePresentation: "full",
        },
        {
          metricKey: "marketing.ltv_cac",
          sourceLabel: "Shopify + Google Sheets",
          valuePresentation: "ratio",
        },
        { metricKey: "klaviyo.email_open_rate", sourceLabel: "Klaviyo" },
      ],
      charts: [
        {
          title: "New and returning customers",
          description: "Provider customer classifications for the selected period.",
          metricKey: "customers.new_count",
          secondaryMetricKey: "customers.returning_count",
          kind: "stacked",
        },
        {
          title: "Store funnel",
          description: "Sessions, cart, checkout, and completed purchase progression.",
          metricKey: "commerce.web_funnel",
          kind: "funnel",
        },
        {
          title: "Customer cohorts",
          description:
            "Revenue LTV by acquisition month; immature fixed-horizon cohorts remain unavailable.",
          metricKey: "customers.realized_ltv_cohorts",
          kind: "area",
          series: [
            { key: "ltv30d", label: "30 days", tone: "sage" },
            { key: "ltv60d", label: "60 days", tone: "gold" },
            { key: "ltv90d", label: "90 days", tone: "terracotta" },
            { key: "ltv180d", label: "180 days", tone: "plum" },
            { key: "lifetime", label: "Lifetime", tone: "forest" },
          ],
        },
        {
          title: "Customers by city",
          description: "PII-free billing city and state aggregates for qualifying customers.",
          metricKey: "customers.geo_city",
          sourceLabel: "Shopify",
          kind: "horizontal",
        },
        {
          title: "Age mix",
          description:
            "Share of the latest Klaviyo profile snapshot by declared age band; reporting-period filters do not apply.",
          metricKey: "customers.age_mix",
          sourceLabel: "Klaviyo",
          kind: "donut",
        },
        {
          title: "Gender mix",
          description:
            "Share of the latest Klaviyo profile snapshot by declared gender; undisclosed is preserved and reporting-period filters do not apply.",
          metricKey: "customers.sex_mix",
          sourceLabel: "Klaviyo",
          kind: "donut",
        },
      ],
      tables: [
        {
          title: "Email campaign performance",
          description: "Open and click rates per Klaviyo campaign with attributed revenue.",
          metricKey: "klaviyo.campaign_performance",
          sourceLabel: "Klaviyo",
          dataset: "klaviyo-campaigns",
          hiddenColumns: ["id", "channel", "deliveryRateBasisPoints", "conversions"],
          columnOrder: [
            "name",
            "recipients",
            "openRateBasisPoints",
            "clickRateBasisPoints",
            "conversionValueMinorUnits",
          ],
          columnLabels: {
            name: "Campaign",
            recipients: "Sent",
            openRateBasisPoints: "Open rate",
            clickRateBasisPoints: "Click rate",
            conversionValueMinorUnits: "Revenue",
          },
        },
      ],
    }),
    products: spec({
      slug: "products",
      kpis: [
        "products.units_sold",
        "products.units_velocity",
        "inventory.shopify_current",
        "inventory.value",
        "quality.missing_sku_cost",
        "inventory.sell_through",
        "inventory.runway_reorder",
      ],
      charts: [
        {
          title: "Product demand",
          description: "Certified net units sold by approved product.",
          metricKey: "products.units_sold",
          kind: "horizontal",
        },
        {
          title: "Product mix",
          description: "Approved product contribution to the selected sales basis.",
          metricKey: "products.mix",
          kind: "donut",
        },
        {
          title: "Inventory position",
          description: "Current inventory available from verified Shopify locations.",
          metricKey: "inventory.shopify_current",
          // Product-and-state categories read left-to-right; upright bars force
          // the axis to drop most of their labels.
          kind: "horizontal",
        },
      ],
      tables: [
        {
          title: "Product catalog",
          description: "Verified Shopify product and variant attributes.",
          metricKey: "products.catalog",
          dataset: "product-catalog",
          hiddenColumns: ["sku"],
        },
        {
          title: "SKU velocity",
          description: "Approved unit velocity by SKU and reporting period.",
          metricKey: "products.units_velocity",
          dataset: "product-velocity",
        },
      ],
    }),
    operations: spec({
      slug: "operations",
      kpis: [
        "inventory.shopify_current",
        "operations.shipped_delivered",
        "inventory.combined",
        "forecast.variance",
        "production.incoming",
      ],
      charts: [
        {
          title: "Fulfillment status",
          description: "Approved provider fulfillment-state counts.",
          metricKey: "operations.fulfillment_summary",
          kind: "horizontal",
        },
        {
          title: "Combined inventory",
          description: "SNAPL and YBYD inventory after validated workbook records are available.",
          metricKey: "inventory.combined",
          kind: "bar",
        },
        {
          title: "Forecast variance",
          description: "Approved actual and forecast units for matching SKU, channel, and period.",
          metricKey: "forecast.variance",
          kind: "line",
        },
        {
          title: "Incoming production",
          description: "Approved production quantities and expected dates.",
          metricKey: "production.incoming",
          kind: "area",
        },
        {
          title: "Additional depletions",
          description: "Validated non-revenue inventory movements grouped by reason.",
          metricKey: "inventory.depletions",
          kind: "donut",
        },
      ],
      tables: [
        {
          title: "Inventory lots and FEFO",
          description: "Lot, best-by, and FEFO readiness from validated source rows.",
          metricKey: "inventory.lots",
          dataset: "inventory-lots",
        },
        {
          title: "Incoming production schedule",
          description: "Production records and timing from the approved operational source.",
          metricKey: "production.incoming",
          dataset: "incoming-production",
        },
      ],
    }),
    marketing: spec({
      slug: "marketing",
      kpis: [
        "klaviyo.email_recipients",
        "klaviyo.email_delivery_rate",
        "klaviyo.email_open_rate",
        "klaviyo.email_click_rate",
        "klaviyo.attributed_revenue",
      ],
      charts: [
        {
          title: "Store conversion funnel",
          description: "Certified Shopify store-session funnel.",
          metricKey: "commerce.web_funnel",
          kind: "funnel",
        },
        {
          title: "Email engagement",
          description: "Klaviyo engagement only when the account records approved activity.",
          metricKey: "klaviyo.engagement_trend",
          kind: "line",
        },
        {
          title: "Campaign performance",
          description: "Approved Klaviyo campaign reporting; no inferred attribution.",
          metricKey: "klaviyo.campaign_performance",
          kind: "horizontal",
        },
        {
          title: "Marketing spend",
          description:
            "Spend from the approved workbook; it does not itself establish CAC or ROAS attribution.",
          metricKey: "marketing.spend",
          kind: "bar",
        },
      ],
      tables: [
        {
          title: "Klaviyo campaigns",
          description: "Future-ready campaign dataset with truthful no-activity handling.",
          metricKey: "klaviyo.campaign_performance",
          dataset: "klaviyo-campaigns",
        },
        {
          title: "Klaviyo flows",
          description: "Future-ready flow dataset with truthful no-activity handling.",
          metricKey: "klaviyo.flow_performance",
          dataset: "klaviyo-flows",
        },
      ],
    }),
    insights: spec({
      slug: "insights",
      kpis: [
        "sources.freshness",
        "sources.historical_completeness",
        "quality.missing_sku_cost",
        "quality.unclassified_channel",
        "quality.klaviyo_no_activity",
        "quality.sop_validation",
      ],
      charts: [
        {
          title: "Source readiness",
          description: "Freshness and completeness evidence for each connected source.",
          metricKey: "sources.freshness",
          kind: "bar",
        },
        {
          title: "Alert readiness",
          description: "Deterministic alerts activate only after their thresholds are approved.",
          metricKey: "alerts.low_inventory",
          kind: "horizontal",
        },
      ],
      tables: [],
    }),
    growth: spec({
      slug: "growth",
      kpis: [
        "growth.open_pipeline",
        "partners.performance",
        "social.performance",
        "growth.weighted_pipeline",
      ],
      charts: [
        {
          title: "Pipeline by type",
          description: "Open opportunities from validated partner and pipeline records.",
          metricKey: "growth.pipeline_by_type",
          kind: "donut",
        },
        {
          title: "Partner performance",
          description: "Approved affiliate, ambassador, and partner outcomes.",
          metricKey: "partners.performance",
          kind: "horizontal",
        },
        {
          title: "Social audience growth",
          description: "Month-end follower totals and growth for Instagram, TikTok, and LinkedIn.",
          metricKey: "social.performance",
          kind: "line",
        },
      ],
      tables: [
        {
          title: "Partner performance",
          description: "Conditional partner records and approved performance fields.",
          metricKey: "partners.performance",
          dataset: "partner-performance",
        },
        {
          title: "Next actions",
          description: "Open pipeline actions from maintained source records.",
          metricKey: "growth.next_actions",
          dataset: "growth-next-actions",
        },
      ],
    }),
    financial: spec({
      slug: "financial",
      kpis: [
        "commerce.total_sales",
        "finance.actual_expenses",
        "finance.actual_margin",
        "finance.cash_position",
        "inventory.value",
        "finance.monthly_burn",
        "finance.cash_runway",
      ],
      charts: [
        {
          title: "Budget versus actual",
          description: "Approved plan and actual values for matching periods and definitions.",
          metricKey: "finance.budget_vs_actual",
          kind: "bar",
        },
        {
          title: "Expense composition",
          description: "Actual expense categories from validated finance records.",
          metricKey: "finance.expense_composition",
          kind: "donut",
        },
        {
          title: "Cash position",
          description: "Approved cash snapshots without inferred future cash flow.",
          metricKey: "finance.cash_position",
          kind: "line",
        },
        {
          title: "Production cost and payment",
          description: "Approved production cost and payment-date records.",
          metricKey: "production.cost_payment",
          kind: "area",
        },
      ],
      tables: [],
    }),
  },
);

export function dashboardPageSpec(slug: DashboardSlug): DashboardPageSpec {
  return dashboardPageSpecs[slug];
}

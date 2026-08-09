import type { DashboardSlug } from "@/src/application/api";

export type ChartKind =
  | "line"
  | "area"
  | "bar"
  | "horizontal"
  | "stacked"
  | "donut"
  | "funnel"
  | "heatmap";

export interface PageChartSpec {
  readonly title: string;
  readonly description: string;
  readonly metricKey: string;
  readonly kind: ChartKind;
  readonly secondaryMetricKey?: string;
}

export interface PageTableSpec {
  readonly title: string;
  readonly description: string;
  readonly metricKey: string;
  readonly dataset?: string;
}

export interface DashboardPageSpec {
  readonly slug: DashboardSlug;
  readonly kpis: readonly string[];
  readonly charts: readonly PageChartSpec[];
  readonly tables: readonly PageTableSpec[];
  readonly decisionTitle: string;
  readonly decisionCopy: string;
}

const spec = (value: DashboardPageSpec): DashboardPageSpec => Object.freeze(value);

export const dashboardPageSpecs: Readonly<Record<DashboardSlug, DashboardPageSpec>> = Object.freeze(
  {
    executive: spec({
      slug: "executive",
      kpis: [
        "commerce.net_sales",
        "commerce.orders",
        "commerce.average_order_value",
        "customers.returning_rate",
      ],
      charts: [
        {
          title: "Sales momentum",
          description: "Approved net-sales trend for the selected period.",
          metricKey: "commerce.sales_trend",
          kind: "area",
        },
        {
          title: "Channel contribution",
          description: "Approved native channel mix; unmapped sales remain unclassified.",
          metricKey: "commerce.native_channel_mix",
          kind: "donut",
        },
        {
          title: "Fulfillment health",
          description: "Provider fulfillment statuses under the approved status policy.",
          metricKey: "operations.fulfillment_summary",
          kind: "horizontal",
        },
        {
          title: "Revenue versus plan",
          description: "Actual and plan values only when their basis and period are approved.",
          metricKey: "plan.revenue_variance",
          kind: "bar",
        },
      ],
      tables: [],
      decisionTitle: "Leadership attention",
      decisionCopy:
        "Business-health scoring and ranked recommendations remain unavailable until their deterministic signals, weights, and thresholds are approved.",
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
      ],
      charts: [
        {
          title: "Revenue trend",
          description: "Net-sales movement across the selected reporting period.",
          metricKey: "commerce.sales_trend",
          kind: "line",
        },
        {
          title: "Product revenue",
          description: "Approved merchandise revenue by product or SKU.",
          metricKey: "products.sales",
          kind: "horizontal",
        },
        {
          title: "Units sold",
          description: "Net merchandise items sold by approved SKU.",
          metricKey: "products.units_sold",
          kind: "bar",
        },
        {
          title: "Purchase timing",
          description: "Qualifying orders by New York reporting day and hour.",
          metricKey: "commerce.purchase_heatmap",
          kind: "heatmap",
        },
      ],
      tables: [
        {
          title: "Detailed orders",
          description: "Order-level detail depends on complete approved Shopify history.",
          metricKey: "commerce.detailed_order_drilldown",
          dataset: "detailed-orders",
        },
      ],
      decisionTitle: "Revenue basis",
      decisionCopy:
        "Shopify canonical sales values remain visible only after the revenue, refund, cancellation, discount, tax, and shipping policies are approved.",
    }),
    customers: spec({
      slug: "customers",
      kpis: [
        "customers.new_count",
        "customers.returning_count",
        "customers.returning_rate",
        "customers.active",
        "customers.realized_ltv",
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
          title: "Customer geography",
          description: "Billing geography where Shopify captures a usable location.",
          metricKey: "customers.billing_geography",
          kind: "horizontal",
        },
        {
          title: "Customer cohorts",
          description: "Repeat behavior requires complete detailed order history.",
          metricKey: "customers.cohorts",
          kind: "area",
        },
      ],
      tables: [],
      decisionTitle: "History completeness",
      decisionCopy:
        "Cohorts, realized lifetime value, RFM, and repeat behavior must disclose historical completeness and never infer missing customer history.",
    }),
    products: spec({
      slug: "products",
      kpis: [
        "products.units_sold",
        "products.units_velocity",
        "inventory.shopify_current",
        "quality.missing_sku_cost",
        "inventory.sell_through",
      ],
      charts: [
        {
          title: "Product demand",
          description: "Certified net units sold by approved SKU.",
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
          // SKU-and-state categories read left-to-right; upright bars force the
          // axis to drop most of their labels.
          kind: "horizontal",
        },
        {
          title: "Inventory runway & reorder",
          description:
            "Runway, stockout, and reorder guidance requires approved operational inputs and rules.",
          metricKey: "inventory.runway_reorder",
          kind: "area",
        },
      ],
      tables: [
        {
          title: "Product catalog",
          description: "Verified Shopify product and variant attributes.",
          metricKey: "products.catalog",
          dataset: "product-catalog",
        },
        {
          title: "SKU velocity",
          description: "Approved unit velocity by SKU and reporting period.",
          metricKey: "products.units_velocity",
          dataset: "product-velocity",
        },
      ],
      decisionTitle: "Product readiness",
      decisionCopy:
        "Margin, inventory value, reorder dates, and frequently bought together analysis remain blocked until their source data and business rules are approved.",
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
      ],
      tables: [
        {
          title: "Inventory lots & FEFO",
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
      decisionTitle: "Operational activation",
      decisionCopy:
        "Conditional operational analytics activate independently. Missing workbook inputs never block current Shopify inventory or unrelated fulfillment reporting.",
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
      decisionTitle: "Attribution boundary",
      decisionCopy:
        "Marketing spend supplies spend only. CAC, ROAS, and LTV:CAC require separately approved numerators, denominators, and verified attribution sources.",
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
      decisionTitle: "Recommendations policy",
      decisionCopy:
        "V1 supports deterministic alerts only. Assignment actions and AI-generated recommendations are explicitly outside V1.",
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
          title: "Social performance",
          description: "Approved platform metrics from maintained social records.",
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
      decisionTitle: "Conditional module",
      decisionCopy:
        "Growth Intelligence remains source-gated. Weighted pipeline probability is not a V1 calculation and will not be inferred.",
    }),
    financial: spec({
      slug: "financial",
      kpis: [
        "commerce.total_sales",
        "finance.actual_expenses",
        "finance.actual_margin",
        "finance.cash_position",
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
          title: "Production cost & payment",
          description: "Approved production cost and payment-date records.",
          metricKey: "production.cost_payment",
          kind: "area",
        },
      ],
      tables: [],
      decisionTitle: "Financial activation",
      decisionCopy:
        "Financial Intelligence is conditional on validated actuals and approved policies. Predictive cash flow is outside V1.",
    }),
  },
);

export function dashboardPageSpec(slug: DashboardSlug): DashboardPageSpec {
  return dashboardPageSpecs[slug];
}

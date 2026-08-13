import type { DashboardSlug } from "@/src/application/api";
import type {
  ChartSeriesDefinition,
  ChartValueFormat,
} from "@/src/presentation/components/dashboard/display-contracts";

export type ChartKind =
  | "line"
  | "area"
  | "bar"
  | "horizontal"
  | "stacked"
  | "donut"
  | "funnel"
  | "heatmap"
  | "band"
  | "timeline"
  | "tiers";

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
  readonly valueFormat?: ChartValueFormat;
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
  readonly hideExport?: boolean;
  readonly span?: 1 | 2;
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
          description: "On-time and complete rates for received purchase orders.",
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
          // Horizontal: product names need a full row each to stay readable.
          kind: "horizontal",
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
        { metricKey: "products.units_sold", valuePresentation: "full" },
        {
          metricKey: "products.sku_velocity",
          label: "Units-sold velocity trend",
          sourceLabel: "Shopify",
          valuePresentation: "full",
          unitSuffix: "bars / day",
        },
        {
          metricKey: "inventory.on_hand_bars",
          label: "Current Shopify inventory",
          sourceLabel: "Shopify + Google Sheets",
          valuePresentation: "full",
          unitSuffix: "bars",
        },
        "inventory.value",
        "quality.missing_sku_cost",
        "inventory.sell_through",
        {
          metricKey: "inventory.weeks_cover",
          label: "Weeks of cover",
          sourceLabel: "Shopify + Google Sheets",
          valuePresentation: "full",
          unitSuffix: "weeks",
        },
        {
          metricKey: "products.cogs_flags",
          label: "SKUs above COGS target",
          sourceLabel: "Shopify + Fairafric",
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
          description: "Sellable bar-equivalent inventory by canonical SKU.",
          metricKey: "inventory.on_hand_bars",
          sourceLabel: "Shopify + Google Sheets",
          kind: "horizontal",
        },
        {
          title: "SKU velocity",
          description: "Average net bars sold per day over the trailing 30 days.",
          metricKey: "products.sku_velocity",
          sourceLabel: "Shopify",
          kind: "horizontal",
        },
        {
          title: "Sales by SKU",
          description: "Merchandise net sales grouped by canonical SKU.",
          metricKey: "products.sales",
          sourceLabel: "Shopify",
          kind: "horizontal",
        },
        {
          title: "Margin by SKU",
          description: "Gross margin after approved landed COGS by canonical SKU.",
          metricKey: "products.sku_margin",
          sourceLabel: "Shopify + Fairafric",
          kind: "horizontal",
        },
        {
          title: "Stock versus ideal band",
          description: "Current sellable stock against approved minimum and maximum levels.",
          metricKey: "inventory.sku_stock",
          sourceLabel: "Shopify + Google Sheets",
          kind: "band",
        },
        {
          title: "Per-bar COGS versus target",
          description: "Landed manufacturing cost per bar against the approved target.",
          metricKey: "manufacturing.cogs_trend",
          sourceLabel: "Fairafric",
          kind: "line",
          series: [
            { key: "value", label: "Actual COGS", tone: "forest" },
            { key: "secondaryValue", label: "Target", tone: "gold", pattern: "dashed" },
          ],
        },
      ],
      tables: [
        {
          title: "Product catalog",
          description: "Verified Shopify product and variant attributes.",
          metricKey: "products.catalog",
          dataset: "product-catalog",
          hiddenColumns: ["sku"],
          hideExport: true,
          span: 2,
        },
        {
          title: "SKU margin & cost",
          description: "Certified sales and cost coverage by canonical SKU.",
          coverageNote:
            "Cost, target, margin, and status remain unavailable for any SKU without approved landed-cost and target records.",
          metricKey: "products.sku_margin",
          sourceLabel: "Shopify + Fairafric",
          dataset: "sku-margin",
          span: 2,
          columnOrder: [
            "sku",
            "units",
            "revenueMinorUnits",
            "cogsPerBarMinorUnits",
            "targetPerBarMinorUnits",
            "marginBasisPoints",
            "status",
          ],
          columnLabels: {
            sku: "SKU",
            units: "Units",
            revenueMinorUnits: "Revenue",
            cogsPerBarMinorUnits: "COGS per bar",
            targetPerBarMinorUnits: "Target per bar",
            marginBasisPoints: "Margin",
            status: "Status",
          },
        },
      ],
    }),
    operations: spec({
      slug: "operations",
      kpis: [
        { metricKey: "inventory.shopify_current", valuePresentation: "full", unitSuffix: "bars" },
        { metricKey: "operations.shipped_delivered", valuePresentation: "full" },
        { metricKey: "inventory.combined", valuePresentation: "full", unitSuffix: "bars" },
        { metricKey: "forecast.variance", valuePresentation: "full" },
        { metricKey: "production.incoming", valuePresentation: "full" },
        {
          metricKey: "operations.manufacturer_otif",
          label: "On-time & complete (manufacturer)",
          sourceLabel: "Google Sheets",
          valuePresentation: "full",
        },
        {
          metricKey: "operations.manufacturer_lead_time",
          label: "Average manufacturer lead time",
          sourceLabel: "Google Sheets",
          valuePresentation: "full",
          unitSuffix: "days",
        },
        {
          metricKey: "operations.warehouse_on_time_accuracy",
          label: "Warehouse on-time & accurate",
          sourceLabel: "3PL",
          valuePresentation: "full",
        },
        {
          metricKey: "operations.refund_rate",
          label: "Refund rate",
          sourceLabel: "Shopify",
          valuePresentation: "full",
        },
        {
          metricKey: "inventory.stock_health",
          label: "Stock level health",
          sourceLabel: "Shopify + Google Sheets",
          valuePresentation: "full",
        },
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
          title: "Additional depletions",
          description: "Validated non-revenue inventory movements grouped by reason.",
          metricKey: "inventory.depletions",
          kind: "donut",
        },
        {
          title: "Projected delivery timeline",
          description:
            "Certified production starts and expected arrival dates for active purchase orders.",
          metricKey: "production.delivery_timeline",
          sourceLabel: "Google Sheets",
          kind: "timeline",
        },
        {
          title: "Stock versus ideal band",
          description: "Current bar-equivalent stock against each SKU's effective approved band.",
          metricKey: "inventory.sku_stock",
          sourceLabel: "Shopify + Google Sheets",
          kind: "band",
        },
        {
          title: "Packaging material stock",
          description: "Latest packaging quantities against effective approved ideal bands.",
          metricKey: "inventory.packaging_stock",
          sourceLabel: "Google Sheets",
          kind: "band",
        },
        {
          title: "Packaging stock projection",
          description:
            "Four complete months of stock, certified incoming POs, and approved consumption.",
          metricKey: "inventory.packaging_projection",
          sourceLabel: "Google Sheets",
          kind: "line",
          series: [
            { key: "barWrappers", label: "Bar wrappers", tone: "forest" },
            { key: "cartons", label: "Cartons", tone: "gold" },
            { key: "shipperBoxes", label: "Shipper boxes", tone: "terracotta" },
          ],
        },
        {
          title: "Manufacturer delivery performance",
          description: "On-time, complete and damage-free rates across eligible purchase orders.",
          metricKey: "operations.manufacturer_performance",
          sourceLabel: "Google Sheets",
          kind: "horizontal",
        },
      ],
      tables: [
        {
          title: "Inventory lots & FEFO",
          description: "Lot, best-by, and FEFO readiness from validated source rows.",
          metricKey: "inventory.lots",
          sourceLabel: "Google Sheets",
          dataset: "inventory-lots",
          span: 2,
          hiddenColumns: ["asOfDate", "warnings"],
          columnOrder: ["warehouse", "sku", "lotCode", "bestByDate", "quantityRemaining", "status"],
          columnLabels: {
            warehouse: "Warehouse",
            sku: "SKU",
            lotCode: "Lot",
            bestByDate: "Best by",
            quantityRemaining: "Quantity",
            status: "Status",
          },
        },
        {
          title: "Incoming production schedule",
          description: "Production records and timing from the approved operational source.",
          metricKey: "production.incoming",
          sourceLabel: "Google Sheets",
          dataset: "incoming-production",
          span: 2,
          hiddenColumns: [
            "poNumber",
            "poLine",
            "unitsReceived",
            "incomingValueMinorUnits",
            "freightMinorUnits",
          ],
          columnOrder: [
            "sku",
            "incomingUnits",
            "expectedArrivalDate",
            "status",
            "destinationWarehouse",
          ],
          columnLabels: {
            sku: "Item",
            incomingUnits: "Quantity",
            expectedArrivalDate: "Expected arrival",
            status: "Status",
            destinationWarehouse: "Destination",
          },
        },
        {
          title: "Packaging material stock",
          description: "Latest stock, approved band, and open incoming purchase order coverage.",
          coverageNote:
            "Rows remain unavailable where stock, effective bands, or incoming-PO coverage is incomplete.",
          metricKey: "inventory.packaging_stock",
          sourceLabel: "Google Sheets",
          dataset: "packaging-stock",
          span: 2,
          columnOrder: ["material", "onHand", "idealMin", "idealMax", "incoming", "eta"],
          columnLabels: {
            material: "Material",
            onHand: "On hand",
            idealMin: "Ideal minimum",
            idealMax: "Ideal maximum",
            incoming: "Incoming",
            eta: "ETA",
          },
        },
      ],
    }),
    marketing: spec({
      slug: "marketing",
      kpis: [
        { metricKey: "klaviyo.email_recipients", sourceLabel: "Klaviyo" },
        { metricKey: "klaviyo.email_delivery_rate", sourceLabel: "Klaviyo" },
        { metricKey: "klaviyo.email_open_rate", sourceLabel: "Klaviyo" },
        { metricKey: "klaviyo.email_click_rate", sourceLabel: "Klaviyo" },
        { metricKey: "klaviyo.attributed_revenue", sourceLabel: "Klaviyo" },
        { metricKey: "social.followers_total", sourceLabel: "Google Sheets" },
        { metricKey: "collabs.active", sourceLabel: "Google Sheets" },
        { metricKey: "ambassadors.active", sourceLabel: "Google Sheets" },
        {
          metricKey: "ambassadors.sessions",
          sourceLabel: "Shopify + affiliate mappings",
        },
        {
          metricKey: "ambassadors.revenue",
          sourceLabel: "Shopify + affiliate mappings",
        },
      ],
      charts: [
        {
          title: "Marketing spend",
          description: "Monthly spend from the approved workbook; no attribution is inferred.",
          metricKey: "marketing.spend",
          sourceLabel: "Google Sheets",
          kind: "bar",
        },
        {
          title: "Email conversion funnel",
          description:
            "Emails sent progressing through delivery, opens, and clicks — with delivery, open, and click rate shown at each stage.",
          metricKey: "klaviyo.email_funnel",
          sourceLabel: "Klaviyo",
          kind: "funnel",
        },
        {
          title: "Email engagement",
          description: "Klaviyo opens and clicks by month, normalized to the reporting timezone.",
          metricKey: "klaviyo.engagement_trend",
          sourceLabel: "Klaviyo",
          kind: "line",
          series: [
            { key: "opens", label: "Opens", tone: "forest" },
            { key: "clicks", label: "Clicks", tone: "gold" },
          ],
        },
        {
          title: "Follower growth by channel",
          description: "Validated month-end follower counts for maintained social channels.",
          metricKey: "social.follower_growth",
          sourceLabel: "Google Sheets",
          kind: "line",
          series: [
            { key: "instagram", label: "Instagram", tone: "forest" },
            { key: "tiktok", label: "TikTok", tone: "gold" },
            { key: "youtube", label: "YouTube", tone: "terracotta" },
          ],
        },
        {
          title: "Collaboration reach",
          description: "Active and scheduled brand collaborations ranked by audience reach.",
          metricKey: "collabs.reach",
          sourceLabel: "Google Sheets",
          kind: "horizontal",
        },
        {
          title: "Collaborations by category",
          description: "Active and scheduled collaborations grouped by approved category.",
          metricKey: "collabs.by_category",
          sourceLabel: "Google Sheets",
          kind: "donut",
        },
        {
          title: "Web traffic by source",
          description: "Sessions grouped by the provider referrer classification.",
          metricKey: "traffic.attribution",
          sourceLabel: "Shopify",
          kind: "horizontal",
        },
        {
          title: "Social mentions by channel",
          description: "Recorded brand mentions grouped by platform.",
          metricKey: "social.mentions_by_channel",
          sourceLabel: "Google Sheets",
          kind: "horizontal",
        },
        {
          title: "Affiliate ROI by message",
          description:
            "Attributed net sales divided by commission and spend, per messaging category.",
          metricKey: "marketing.affiliate_roi_message",
          sourceLabel: "Affiliate records + attribution",
          kind: "horizontal",
          valueFormat: "ratio",
        },
        {
          title: "Campaign ROI",
          description: "Attributed net sales divided by campaign spend.",
          metricKey: "marketing.campaign_roi",
          sourceLabel: "Google Sheets + attribution",
          kind: "horizontal",
          valueFormat: "ratio",
        },
      ],
      tables: [
        {
          title: "Klaviyo flows",
          description: "Approved flow performance under Klaviyo send-date semantics.",
          metricKey: "klaviyo.flow_performance",
          sourceLabel: "Klaviyo",
          dataset: "klaviyo-flows",
          span: 2,
          hiddenColumns: ["id"],
          columnOrder: [
            "name",
            "channel",
            "recipients",
            "deliveryRateBasisPoints",
            "openRateBasisPoints",
            "clickRateBasisPoints",
            "conversions",
            "conversionValueMinorUnits",
          ],
          columnLabels: {
            name: "Flow",
            channel: "Channel",
            recipients: "Sent",
            deliveryRateBasisPoints: "Delivery rate",
            openRateBasisPoints: "Open rate",
            clickRateBasisPoints: "Click rate",
            conversions: "Conversions",
            conversionValueMinorUnits: "Revenue",
          },
        },
        {
          title: "Social channel performance",
          description: "Followers, growth, attributed revenue, and audience reach by channel.",
          coverageNote:
            "Revenue is shown only where an attribution source is recorded; missing measures remain unavailable.",
          metricKey: "social.channel_performance",
          sourceLabel: "Google Sheets + attributed link tracking",
          dataset: "social-channels",
          span: 2,
          columnOrder: [
            "channel",
            "followers",
            "growthRateBasisPoints",
            "revenueMinorUnits",
            "audienceReach",
          ],
          columnLabels: {
            channel: "Channel",
            followers: "Followers",
            growthRateBasisPoints: "Growth rate",
            revenueMinorUnits: "Revenue",
            audienceReach: "Audience reach",
          },
        },
        {
          title: "Top ambassadors",
          description: "Clicks, orders, and attributed revenue per ambassador code.",
          coverageNote:
            "Shopify sessions and sales require unique exact UTM and discount-code mappings.",
          metricKey: "ambassadors.top",
          sourceLabel: "Shopify + affiliate mappings",
          dataset: "top-ambassadors",
          span: 2,
          columnOrder: [
            "ambassador",
            "code",
            "clicks",
            "orders",
            "revenueMinorUnits",
            "commissionMinorUnits",
          ],
          columnLabels: {
            ambassador: "Ambassador",
            code: "Code",
            clicks: "Clicks",
            orders: "Orders",
            revenueMinorUnits: "Revenue",
            commissionMinorUnits: "Commission",
          },
        },
        {
          title: "Brand collaborations",
          description: "Active and scheduled collaborations ranked by reach.",
          metricKey: "collabs.reach",
          sourceLabel: "Google Sheets",
          dataset: "brand-collaborations",
          span: 2,
          columnOrder: ["partner", "category", "reach", "status", "launchDate"],
          columnLabels: {
            partner: "Partner",
            category: "Category",
            reach: "Reach",
            status: "Status",
            launchDate: "Launch",
          },
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
        {
          metricKey: "growth.open_pipeline_value",
          label: "Open pipeline",
          sourceLabel: "Google Sheets",
          valuePresentation: "full",
        },
        {
          metricKey: "growth.closed_pipeline",
          sourceLabel: "Google Sheets",
          valuePresentation: "full",
        },
        {
          metricKey: "partners.performance",
          sourceLabel: "Shopify + Google Sheets",
          valuePresentation: "full",
        },
        {
          metricKey: "social.performance",
          label: "Social performance",
          sourceLabel: "Google Sheets",
          valuePresentation: "full",
        },
        {
          metricKey: "growth.weighted_pipeline",
          sourceLabel: "Google Sheets",
          valuePresentation: "full",
        },
        {
          metricKey: "growth.time_to_close",
          sourceLabel: "Google Sheets",
          valuePresentation: "full",
          unitSuffix: "months",
        },
        {
          metricKey: "growth.time_to_close_target",
          sourceLabel: "Google Sheets",
          valuePresentation: "full",
          unitSuffix: "months",
        },
        { metricKey: "investors.count", sourceLabel: "Google Sheets", valuePresentation: "full" },
        { metricKey: "grants.secured", sourceLabel: "Google Sheets", valuePresentation: "full" },
        { metricKey: "grants.submitted", sourceLabel: "Google Sheets", valuePresentation: "full" },
        {
          metricKey: "grants.acceptance_rate",
          sourceLabel: "Google Sheets",
          valuePresentation: "full",
        },
      ],
      charts: [
        {
          title: "Pipeline by type",
          description: "Open opportunities from validated partner and pipeline records.",
          metricKey: "growth.pipeline_by_type",
          sourceLabel: "Google Sheets",
          kind: "donut",
        },
        {
          title: "Partner performance",
          description: "Approved affiliate, ambassador, and partner outcomes.",
          metricKey: "partners.performance",
          sourceLabel: "Shopify + Google Sheets",
          kind: "horizontal",
          valueFormat: "money",
        },
        {
          title: "Social performance",
          description: "Approved platform metrics from maintained social records.",
          metricKey: "social.performance",
          sourceLabel: "Google Sheets",
          kind: "line",
        },
        {
          title: "Weighted pipeline by industry",
          description: "Open opportunity value weighted by recorded stage confidence.",
          metricKey: "growth.weighted_by_industry",
          sourceLabel: "Google Sheets",
          kind: "horizontal",
          valueFormat: "money",
        },
        {
          title: "Grant applications submitted",
          description: "Applications submitted in the trailing week, month, and year to date.",
          metricKey: "grants.rolling",
          sourceLabel: "Google Sheets",
          kind: "bar",
        },
      ],
      tables: [
        {
          title: "Partner performance",
          description: "Conditional partner records and approved performance fields.",
          metricKey: "partners.performance",
          sourceLabel: "Shopify + Google Sheets",
          dataset: "partner-performance",
          span: 2,
          columnOrder: [
            "partner",
            "partnerType",
            "platform",
            "orders",
            "revenueMinorUnits",
            "commissionMinorUnits",
          ],
          columnLabels: {
            partner: "Partner",
            partnerType: "Type",
            platform: "Platform",
            orders: "Orders",
            revenueMinorUnits: "Revenue",
            commissionMinorUnits: "Commission",
          },
        },
        {
          title: "Next actions",
          description: "Open pipeline actions from maintained source records.",
          metricKey: "growth.next_actions",
          sourceLabel: "Google Sheets",
          dataset: "growth-next-actions",
          span: 2,
          columnOrder: ["opportunityName", "nextAction", "dueDate", "valueMinorUnits"],
          columnLabels: {
            opportunityName: "Opportunity",
            nextAction: "Next action",
            dueDate: "Due date",
            valueMinorUnits: "Value",
          },
        },
        {
          title: "Investor pipeline",
          description: "Recorded investors, stage, interest level, and next step.",
          metricKey: "investors.pipeline",
          sourceLabel: "Google Sheets",
          dataset: "investor-pipeline",
          span: 2,
          columnOrder: ["investor", "stage", "interestLevel", "checkSizeMinorUnits", "nextStep"],
          columnLabels: {
            investor: "Investor",
            stage: "Stage",
            interestLevel: "Interest level",
            checkSizeMinorUnits: "Check size",
            nextStep: "Next step",
          },
        },
        {
          title: "Grant applications",
          description: "Submitted applications, requested amount, and decision status.",
          metricKey: "grants.submitted",
          sourceLabel: "Google Sheets",
          dataset: "grant-applications",
          span: 2,
          columnOrder: ["grant", "submittedDate", "requestedAmountMinorUnits", "status"],
          columnLabels: {
            grant: "Grant",
            submittedDate: "Submitted date",
            requestedAmountMinorUnits: "Requested amount",
            status: "Status",
          },
        },
      ],
    }),
    financial: spec({
      slug: "financial",
      kpis: [
        { metricKey: "commerce.total_sales", sourceLabel: "Shopify" },
        { metricKey: "finance.actual_expenses", sourceLabel: "Google Sheets" },
        {
          metricKey: "finance.actual_margin",
          label: "Actual gross margin",
          sourceLabel: "Shopify + Google Sheets",
        },
        { metricKey: "finance.cash_position", sourceLabel: "Google Sheets" },
        { metricKey: "inventory.value", sourceLabel: "Shopify + Google Sheets" },
        { metricKey: "finance.monthly_burn", sourceLabel: "Google Sheets" },
        { metricKey: "finance.cash_runway", sourceLabel: "Google Sheets" },
        {
          metricKey: "finance.effective_cogs",
          label: "Effective COGS per bar",
          sourceLabel: "Fairafric",
        },
        {
          metricKey: "finance.rebate_tier",
          label: "Fairafric rebate tier",
          sourceLabel: "Fairafric",
        },
      ],
      charts: [
        {
          title: "Expense composition",
          description: "Actual expense categories from validated finance records.",
          metricKey: "finance.expense_composition",
          kind: "donut",
          sourceLabel: "Google Sheets",
        },
        {
          title: "Cash position",
          description: "Approved cash snapshots without inferred future cash flow.",
          metricKey: "finance.cash_position",
          kind: "line",
          sourceLabel: "Google Sheets",
        },
        {
          title: "Production cost & payment",
          description: "Approved production cost and payment-date records.",
          metricKey: "production.cost_payment",
          kind: "area",
          sourceLabel: "Google Sheets",
        },
        {
          title: "Budget versus actual",
          description: "Approved plan and actual values for matching periods and definitions.",
          metricKey: "finance.budget_vs_actual",
          kind: "line",
          sourceLabel: "Google Sheets",
          series: [
            { key: "value", label: "Actual", tone: "forest" },
            {
              key: "secondaryValue",
              label: "Plan",
              tone: "gold",
              pattern: "dashed",
            },
          ],
        },
        {
          title: "Margin by channel",
          description: "Contribution margin after landed COGS, channel fees, and commission.",
          metricKey: "revenue.channel_margin",
          kind: "horizontal",
          sourceLabel: "Shopify + Google Sheets",
        },
        {
          title: "Fairafric volume rebate tiers",
          description: "Approved qualifying-volume tiers and progress toward the next rebate.",
          metricKey: "finance.rebate_tiers",
          kind: "tiers",
          sourceLabel: "Fairafric",
        },
      ],
      tables: [],
    }),
  },
);

export function dashboardPageSpec(slug: DashboardSlug): DashboardPageSpec {
  return dashboardPageSpecs[slug];
}

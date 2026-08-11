import type { DashboardSection } from "@/src/domain/metrics/catalog";

export const dashboardSlugToSection = {
  executive: "Executive Health",
  revenue: "Revenue Intelligence",
  customers: "Customer Intelligence",
  products: "Product Intelligence",
  operations: "Operations Intelligence",
  marketing: "Marketing Intelligence",
  growth: "Growth Intelligence",
  financial: "Financial Intelligence",
  insights: "Insights and Data Quality",
} as const satisfies Readonly<Record<string, DashboardSection>>;

export type DashboardSlug = keyof typeof dashboardSlugToSection;

export interface DrilldownDefinition {
  readonly dataset: string;
  readonly section: DashboardSection;
  readonly metricKey: string;
  readonly fields: readonly string[];
  readonly sortFields: readonly string[];
  readonly exportable: boolean;
  readonly sourceLimited?: boolean;
  readonly implementationPending?: boolean;
}

const definition = (value: DrilldownDefinition): DrilldownDefinition => Object.freeze(value);

export const drilldownCatalog = Object.freeze([
  definition({
    dataset: "customer-ltv-cohorts",
    section: "Customer Intelligence",
    metricKey: "customers.realized_ltv_cohorts",
    fields: [
      "cohortMonth",
      "customerCount",
      "ltv30dMinorUnits",
      "ltv60dMinorUnits",
      "ltv90dMinorUnits",
      "ltv180dMinorUnits",
      "lifetimeLtvMinorUnits",
      "mature30d",
      "mature60d",
      "mature90d",
      "mature180d",
      "excludedRows",
    ],
    sortFields: ["cohortMonth", "customerCount"],
    exportable: true,
  }),
  definition({
    dataset: "product-catalog",
    section: "Product Intelligence",
    metricKey: "products.catalog",
    fields: ["product", "variant", "sku", "status", "priceMinorUnits"],
    sortFields: ["product", "variant", "sku", "status"],
    exportable: true,
  }),
  definition({
    dataset: "product-velocity",
    section: "Product Intelligence",
    metricKey: "products.units_velocity",
    fields: ["period", "product", "variant", "sku", "units"],
    sortFields: ["period", "product", "sku", "units"],
    exportable: true,
  }),
  definition({
    dataset: "klaviyo-campaigns",
    section: "Marketing Intelligence",
    metricKey: "klaviyo.campaign_performance",
    fields: [
      "id",
      "name",
      "channel",
      "recipients",
      "deliveryRateBasisPoints",
      "openRateBasisPoints",
      "clickRateBasisPoints",
      "conversions",
      "conversionValueMinorUnits",
    ],
    sortFields: ["name", "recipients", "conversions"],
    exportable: true,
  }),
  definition({
    dataset: "klaviyo-flows",
    section: "Marketing Intelligence",
    metricKey: "klaviyo.flow_performance",
    fields: [
      "id",
      "name",
      "channel",
      "recipients",
      "deliveryRateBasisPoints",
      "openRateBasisPoints",
      "clickRateBasisPoints",
      "conversions",
      "conversionValueMinorUnits",
    ],
    sortFields: ["name", "recipients", "conversions"],
    exportable: true,
  }),
  definition({
    dataset: "inventory-lots",
    section: "Operations Intelligence",
    metricKey: "inventory.lots",
    fields: [
      "asOfDate",
      "warehouse",
      "sku",
      "lotCode",
      "bestByDate",
      "quantityRemaining",
      "status",
    ],
    sortFields: ["asOfDate", "warehouse", "sku", "bestByDate"],
    exportable: true,
  }),
  definition({
    dataset: "forecast-variance",
    section: "Operations Intelligence",
    metricKey: "forecast.variance",
    fields: ["period", "sku", "channel", "forecastUnits", "actualUnits", "varianceUnits"],
    sortFields: ["period", "sku", "channel", "varianceUnits"],
    exportable: true,
  }),
  definition({
    dataset: "incoming-production",
    section: "Operations Intelligence",
    metricKey: "production.incoming",
    fields: [
      "poNumber",
      "poLine",
      "sku",
      "destinationWarehouse",
      "status",
      "expectedArrivalDate",
      "incomingUnits",
      "unitsReceived",
    ],
    sortFields: ["expectedArrivalDate", "sku", "status"],
    exportable: true,
  }),
  definition({
    dataset: "partner-performance",
    section: "Growth Intelligence",
    metricKey: "partners.performance",
    fields: [
      "periodStart",
      "periodEnd",
      "partnerType",
      "partner",
      "platform",
      "orders",
      "revenueMinorUnits",
      "commissionMinorUnits",
      "payoutStatus",
    ],
    sortFields: ["periodStart", "partnerType", "partner", "revenueMinorUnits"],
    exportable: true,
  }),
  definition({
    dataset: "growth-next-actions",
    section: "Growth Intelligence",
    metricKey: "growth.next_actions",
    fields: [
      "pipelineType",
      "opportunityId",
      "opportunityName",
      "stage",
      "status",
      "nextAction",
      "dueDate",
      "valueMinorUnits",
    ],
    sortFields: ["pipelineType", "stage", "status", "dueDate"],
    exportable: true,
  }),
  definition({
    dataset: "social-performance",
    section: "Marketing Intelligence",
    metricKey: "social.performance",
    fields: [
      "date",
      "platform",
      "account",
      "followers",
      "impressions",
      "reach",
      "engagements",
      "linkClicks",
    ],
    sortFields: ["date", "platform", "account"],
    exportable: true,
  }),
  definition({
    dataset: "detailed-orders",
    section: "Revenue Intelligence",
    metricKey: "commerce.detailed_order_drilldown",
    fields: [],
    sortFields: [],
    exportable: false,
    implementationPending: true,
  }),
] satisfies readonly DrilldownDefinition[]);

export function drilldownDefinition(dataset: string): DrilldownDefinition | undefined {
  return drilldownCatalog.find((item) => item.dataset === dataset);
}

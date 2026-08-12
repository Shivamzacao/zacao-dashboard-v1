import { composeDashboardPage, createMetricViewModel } from "@/src/application/metrics";
import { dashboardApiResponseSchema, drilldownApiResponseSchema } from "./contracts";

const period = { startDate: "2026-07-01", endDate: "2026-07-31" } as const;
const source = {
  source: "shopify" as const,
  state: "current" as const,
  checkedAt: "2026-08-07T12:00:00.000Z",
  lastSuccessfulAt: "2026-08-07T12:00:00.000Z",
  dataAsOf: "2026-07-31T23:59:59.000Z",
  completeness: "complete" as const,
  warningCodes: [],
};
const context = { environment: "test" as const, dataPeriod: period, sourceStatuses: [source] };
const units = createMetricViewModel({
  metricKey: "products.units_sold",
  environment: "test",
  dataPeriod: period,
  sources: [source],
  value: { kind: "count", value: 12 },
});
const page = composeDashboardPage({ section: "Product Intelligence", context, metrics: [units] });

export const syntheticFrontendDashboardFixture = dashboardApiResponseSchema.parse({
  ok: true,
  data: {
    page,
    supportedFilters: {
      channels: ["Website/DTC"],
      productSkus: ["SYNTH-SKU-1"],
      locations: ["SYNTH-WAREHOUSE"],
    },
  },
  meta: {
    schemaVersion: "1.0",
    requestId: "00000000-0000-4000-8000-000000000001",
    cache: { state: "miss", generatedAt: "2026-08-07T12:00:00.000Z", expiresAt: null },
    sources: [source],
  },
});

export const syntheticFrontendDrilldownFixture = drilldownApiResponseSchema.parse({
  ok: true,
  data: {
    dataset: "product-catalog",
    columns: ["product", "sku", "priceMinorUnits"],
    rows: [{ product: "Synthetic Dark Bar", sku: "SYNTH-SKU-1", priceMinorUnits: 1200 }],
    pagination: { nextCursor: null, hasNextPage: false },
    readiness: { state: "current", message: null, warningCodes: [] },
    sources: [source],
  },
  meta: {
    schemaVersion: "1.0",
    requestId: "00000000-0000-4000-8000-000000000002",
    cache: { state: "hit", generatedAt: "2026-08-07T12:00:00.000Z", expiresAt: null },
    sources: [source],
  },
});

export const frontendFixtureBundle = Object.freeze({
  environment: "test" as const,
  synthetic: true as const,
  dashboard: syntheticFrontendDashboardFixture,
  drilldown: syntheticFrontendDrilldownFixture,
});

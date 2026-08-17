import { describe, expect, it } from "vitest";

import {
  apiContractManifest,
  dashboardApiResponseSchema,
  drilldownApiResponseSchema,
  frontendFixtureBundle,
} from "@/src/application/api";

describe("B7 frozen Phase 2 API compatibility", () => {
  it("keeps published synthetic fixtures schema-compatible and explicitly TEST-only", () => {
    expect(frontendFixtureBundle).toMatchObject({ environment: "test", synthetic: true });
    dashboardApiResponseSchema.parse(frontendFixtureBundle.dashboard);
    drilldownApiResponseSchema.parse(frontendFixtureBundle.drilldown);
  });

  it("protects endpoint, dashboard, and approved dataset compatibility", () => {
    expect(apiContractManifest.schemaVersion).toBe("1.0");
    expect(apiContractManifest.endpoints).toEqual({
      liveness: "/api/v1/health",
      readiness: "/api/v1/health/readiness",
      sourceStatus: "/api/v1/sources/status",
      dashboard: "/api/v1/dashboards/{dashboard}",
      drilldown: "/api/v1/drilldowns/{dataset}",
      export: "/api/v1/exports/{dataset}",
    });
    expect(apiContractManifest.dashboards.map(({ slug }) => slug)).toEqual([
      "executive",
      "revenue",
      "customers",
      "products",
      "operations",
      "marketing",
      "growth",
      "financial",
      "insights",
    ]);
    expect(apiContractManifest.drilldowns.map(({ dataset }) => dataset)).toEqual([
      "customer-ltv-cohorts",
      "product-catalog",
      "product-velocity",
      "sku-margin",
      "klaviyo-campaigns",
      "klaviyo-flows",
      "social-channels",
      "top-ambassadors",
      "brand-collaborations",
      "inventory-lots",
      "forecast-variance",
      "incoming-production",
      "packaging-stock",
      "partner-performance",
      "growth-next-actions",
      "investor-pipeline",
      "grant-applications",
      "social-performance",
      "channel-performance",
      "detailed-orders",
    ]);
    expect(
      apiContractManifest.drilldowns.find(({ dataset }) => dataset === "channel-performance"),
    ).toMatchObject({
      exportable: true,
      sourceLimited: false,
      implementationPending: false,
    });
    // The PII-safe field contract now exists (order date, channel, amount,
    // quantity — no customer identity), so the drill-down is implemented and
    // exportable. This is additive: the dataset name and every endpoint path
    // above are unchanged, so no Phase 2 consumer loses anything it had.
    expect(
      apiContractManifest.drilldowns.find(({ dataset }) => dataset === "detailed-orders"),
    ).toMatchObject({
      exportable: true,
      sourceLimited: false,
      implementationPending: false,
    });
  });
});

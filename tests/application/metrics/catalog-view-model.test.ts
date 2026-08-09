import { describe, expect, it } from "vitest";

import { composeDashboardPage, createMetricViewModel } from "@/src/application/metrics";
import { metricCatalog } from "@/src/domain/metrics/catalog";
import { metricRegistry } from "@/src/domain/metrics/registry";
import { usd } from "@/src/domain/utilities/money";

import { context, PERIOD, source } from "./fixtures";

describe("B5 metric classification and certified view models", () => {
  it("registers every active metric and keeps NOT_V1 out of the active registry", () => {
    const active = metricCatalog.filter(({ status }) => status !== "NOT_V1");
    expect(metricRegistry.definitions).toHaveLength(active.length);
    for (const status of [
      "CERTIFIABLE",
      "DATA_PENDING",
      "BUSINESS_RULE_REQUIRED",
      "SOURCE_LIMITED",
      "NOT_V1",
    ] as const) {
      expect(metricCatalog.some((definition) => definition.status === status)).toBe(true);
    }
  });

  it("never emits a numeric value for an unresolved business rule", () => {
    // commerce.net_sales was activated by the approved DEC-015 revenue policy;
    // the business-health score remains a blocked exemplar (weights/thresholds).
    const result = createMetricViewModel({
      metricKey: "executive.business_health_score",
      environment: "test",
      dataPeriod: PERIOD,
      sources: [source("shopify")],
      value: { kind: "money", value: usd(12345) },
    });
    expect(result.value).toBeNull();
    expect(result.implementationStatus).toBe("BUSINESS_RULE_REQUIRED");
    expect(result.readiness.warningCodes).toContain("BUSINESS_RULE_REQUIRED");
  });

  it("distinguishes TEST implementation evidence from empty PRODUCTION data", () => {
    const test = createMetricViewModel({
      metricKey: "marketing.spend",
      environment: "test",
      dataPeriod: PERIOD,
      sources: [source("google_sheets")],
      value: { kind: "money", value: usd(12000) },
    });
    const production = createMetricViewModel({
      metricKey: "marketing.spend",
      environment: "production",
      dataPeriod: PERIOD,
      sources: [source("google_sheets", "no_activity")],
      value: null,
    });
    expect(test.value).toEqual({ kind: "money", value: usd(12000) });
    expect(test.implementationStatus).toBe("DATA_PENDING");
    expect(production.value).toBeNull();
    expect(production.readiness.state).toBe("no_activity");
    expect(production.warnings).toContain("DATA_PENDING");
  });

  it("keeps source-limited and unavailable metrics explicit", () => {
    const limited = createMetricViewModel({
      metricKey: "customers.cohorts",
      environment: "test",
      dataPeriod: PERIOD,
      sources: [source("shopify", "partial")],
      value: { kind: "rate_basis_points", value: 5000 },
    });
    const unavailable = createMetricViewModel({
      metricKey: "commerce.web_funnel",
      environment: "test",
      dataPeriod: PERIOD,
      sources: [source("shopify", "unavailable")],
      value: { kind: "rate_basis_points", value: 250 },
    });
    expect(limited.value).toBeNull();
    expect(limited.readiness.state).toBe("partial");
    expect(unavailable.value).toBeNull();
    expect(unavailable.readiness.state).toBe("unavailable");
  });

  it("activates the shipped/delivered counts DEC-016 approved for disclosure", () => {
    // The tile used to be SOURCE_LIMITED, which nulled the value regardless of
    // what the provider returned. DEC-016 calls for disclosure, not suppression.
    const definition = metricCatalog.find(({ key }) => key === "operations.shipped_delivered");
    expect(definition?.status).toBe("CERTIFIABLE");
    expect(definition?.blockingReason).toBeNull();
    const activated = createMetricViewModel({
      metricKey: "operations.shipped_delivered",
      environment: "production",
      dataPeriod: PERIOD,
      sources: [source("shopify")],
      value: { kind: "count", value: 123 },
      warnings: ["CARRIER_EVENT_COVERAGE_VARIES"],
    });
    expect(activated.value).toEqual({ kind: "count", value: 123 });
    expect(activated.warnings).toContain("CARRIER_EVENT_COVERAGE_VARIES");
  });

  it("keeps the Shopify-sourced operations metrics on the operations section", () => {
    const keys = new Set(
      metricCatalog
        .filter(({ sections }) => sections.includes("Operations Intelligence"))
        .map(({ key }) => key),
    );
    for (const key of [
      "operations.shipped_delivered",
      "operations.fulfillment_trend",
      "products.units_sold",
      "products.units_velocity",
    ]) {
      expect(keys).toContain(key);
    }
  });

  it("composes every metric in a section once without provider records", () => {
    const page = composeDashboardPage({
      section: "Executive Health",
      context: context(
        [
          source("shopify"),
          source("klaviyo", "no_activity"),
          source("google_sheets", "no_activity"),
        ],
        "production",
      ),
    });
    const expected = metricCatalog.filter(({ sections }) => sections.includes("Executive Health"));
    expect(page.metrics).toHaveLength(expected.length);
    expect(new Set(page.metrics.map(({ key }) => key)).size).toBe(page.metrics.length);
  });
});

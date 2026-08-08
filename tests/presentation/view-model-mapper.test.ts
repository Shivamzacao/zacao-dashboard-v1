import { describe, expect, it } from "vitest";

import { composeDashboardPage, createMetricViewModel } from "@/src/application/metrics";
import { metricTableViewModelSchema, type MetricViewModel } from "@/src/application/view-models";
import type { SourceStatus } from "@/src/domain/contracts";
import { mapDashboardPageToDisplayData } from "@/src/presentation/features/dashboard-pages/view-model-mapper";

const dataPeriod = { startDate: "2025-08-08", endDate: "2026-08-07" };

const shopifyCurrent: SourceStatus = {
  source: "shopify",
  state: "current",
  checkedAt: "2026-08-08T00:00:00Z",
  lastSuccessfulAt: "2026-08-08T00:00:00Z",
  dataAsOf: "2026-08-08T00:00:00Z",
  completeness: "complete",
  warningCodes: [],
};

const klaviyoNoActivity: SourceStatus = {
  source: "klaviyo",
  state: "no_activity",
  checkedAt: "2026-08-08T00:00:00Z",
  lastSuccessfulAt: "2026-08-08T00:00:00Z",
  dataAsOf: "2026-08-08T00:00:00Z",
  completeness: "complete",
  warningCodes: ["KLAVIYO_NO_ACTIVITY"],
};

function pageWith(metrics: readonly MetricViewModel[]) {
  return composeDashboardPage({
    section: "Customer Intelligence",
    context: {
      environment: "production",
      dataPeriod,
      sourceStatuses: [shopifyCurrent, klaviyoNoActivity],
    },
    metrics,
  });
}

describe("mapDashboardPageToDisplayData", () => {
  it("maps real values into currentValues and never fabricates blocked entries", () => {
    const returningRate = createMetricViewModel({
      metricKey: "customers.returning_rate",
      environment: "production",
      dataPeriod,
      sources: [shopifyCurrent],
      value: { kind: "rate_basis_points", value: 3_730 },
    });
    const display = mapDashboardPageToDisplayData(pageWith([returningRate]), "production");

    expect(display.synthetic).toBe(false);
    expect(display.currentValues["customers.returning_rate"]).toEqual({
      kind: "rate_basis_points",
      value: 3_730,
    });
    expect(display.states?.["customers.returning_rate"]).toBe("current");

    // Business-rule-blocked metrics get a state and a reason but never a value.
    expect(display.currentValues["customers.active"]).toBeUndefined();
    expect(display.states?.["customers.active"]).toBe("business_rule_required");
    expect(display.stateReasons?.["customers.active"]).toBeTruthy();

    // Source-limited metrics keep their explicit display state.
    expect(display.states?.["customers.cohorts"]).toBe("source_limited");
  });

  it("maps a stage/count table into funnel chart data and dataset rows", () => {
    const funnelMetric = createMetricViewModel({
      metricKey: "commerce.web_funnel",
      environment: "production",
      dataPeriod,
      sources: [shopifyCurrent],
      value: { kind: "rate_basis_points", value: 107 },
    });
    const table = metricTableViewModelSchema.parse({
      metric: funnelMetric,
      columns: ["stage", "count"],
      rows: [
        { stage: "Sessions", count: 2_053 },
        { stage: "Completed checkout", count: 22 },
      ],
    });
    const page = {
      ...pageWith([funnelMetric]),
      tables: [table],
    };
    const display = mapDashboardPageToDisplayData(page, "production");
    expect(display.chartData["commerce.web_funnel"]).toEqual([
      { key: "Sessions", label: "Sessions", value: 2_053 },
      { key: "Completed checkout", label: "Completed checkout", value: 22 },
    ]);
  });

  it("maps source statuses onto indicator models with truthful states", () => {
    const display = mapDashboardPageToDisplayData(pageWith([]), "production");
    expect(display.sources).toEqual([
      expect.objectContaining({ label: "Shopify", state: "current" }),
      expect.objectContaining({ label: "Klaviyo", state: "no_activity" }),
    ]);
  });
});

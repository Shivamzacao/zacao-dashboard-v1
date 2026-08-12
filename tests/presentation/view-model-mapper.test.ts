import { describe, expect, it } from "vitest";

import { composeDashboardPage, createMetricViewModel } from "@/src/application/metrics";
import {
  metricBreakdownViewModelSchema,
  metricTableViewModelSchema,
  type MetricViewModel,
} from "@/src/application/view-models";
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

function pageWith(
  metrics: readonly MetricViewModel[],
  sourceStatuses: readonly SourceStatus[] = [shopifyCurrent, klaviyoNoActivity],
) {
  return composeDashboardPage({
    section: "Customer Intelligence",
    context: {
      environment: "production",
      dataPeriod,
      sourceStatuses,
    },
    metrics,
  });
}

describe("mapDashboardPageToDisplayData", () => {
  it("maps aggregate cohort LTV into five nullable money series without PII", () => {
    const cohortMetric = createMetricViewModel({
      metricKey: "customers.realized_ltv_cohorts",
      environment: "production",
      dataPeriod,
      sources: [shopifyCurrent],
      value: { kind: "money", value: { currency: "USD", minorUnits: 20_000 } },
    });
    const table = metricTableViewModelSchema.parse({
      metric: cohortMetric,
      columns: [
        "cohortMonth",
        "customerCount",
        "ltv30dMinorUnits",
        "ltv60dMinorUnits",
        "ltv90dMinorUnits",
        "ltv180dMinorUnits",
        "lifetimeLtvMinorUnits",
      ],
      rows: [
        {
          cohortMonth: "2026-07",
          customerCount: 4,
          ltv30dMinorUnits: 10_000,
          ltv60dMinorUnits: null,
          ltv90dMinorUnits: null,
          ltv180dMinorUnits: null,
          lifetimeLtvMinorUnits: 20_000,
        },
      ],
    });
    const display = mapDashboardPageToDisplayData(
      { ...pageWith([cohortMetric]), tables: [table] },
      "production",
    );

    expect(display.chartValueFormats?.["customers.realized_ltv_cohorts"]).toBe("money");
    expect(display.chartData["customers.realized_ltv_cohorts"]).toEqual([
      {
        key: "2026-07",
        label: "2026-07",
        value: 200,
        seriesValues: {
          ltv30d: 100,
          ltv60d: null,
          ltv90d: null,
          ltv180d: null,
          lifetime: 200,
        },
      },
    ]);
    expect(JSON.stringify(display.rowsByDataset["customer-ltv-cohorts"])).not.toContain(
      "customerId",
    );
  });

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

    // Metrics without their required connector get a state and a reason but never a value.
    expect(display.currentValues["customers.active"]).toBeUndefined();
    expect(display.states?.["customers.active"]).toBe("not_configured");
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
    // Stage counts must not inherit the metric's own rate unit, or 2,053
    // sessions render as "2,053%".
    expect(display.chartValueFormats?.["commerce.web_funnel"]).toBe("count");
  });

  it("maps source statuses onto indicator models with truthful states", () => {
    const display = mapDashboardPageToDisplayData(pageWith([]), "production");
    expect(display.sources).toEqual([
      expect.objectContaining({ label: "Shopify", state: "current" }),
      expect.objectContaining({ label: "Klaviyo", state: "no_activity" }),
    ]);
  });

  it("omits Phase 2 low-inventory alerts even when rows are supplied", () => {
    const alertMetric = createMetricViewModel({
      metricKey: "alerts.low_inventory",
      environment: "production",
      dataPeriod,
      sources: [shopifyCurrent],
      value: { kind: "status", value: "1 SKU(s) below threshold" },
    });
    const alert = metricBreakdownViewModelSchema.parse({
      metric: alertMetric,
      dimension: "sku",
      items: [
        {
          key: "SKU-LOW",
          label: "SKU-LOW",
          values: [{ kind: "quantity", value: 46 }],
          warnings: ["REORDER_POINT:110"],
        },
        {
          key: "SKU-HEALTHY",
          label: "SKU-HEALTHY",
          values: [{ kind: "quantity", value: 140 }],
          warnings: [],
        },
      ],
    });
    const page = { ...pageWith([]), breakdowns: [alert] };
    const display = mapDashboardPageToDisplayData(page, "production");

    expect(display.alerts).toEqual([]);
  });

  it("formats a comparison metric into a signed percent change with a direction", () => {
    const returningRate = createMetricViewModel({
      metricKey: "customers.returning_rate",
      environment: "production",
      dataPeriod,
      sources: [shopifyCurrent],
      value: { kind: "rate_basis_points", value: 1_200 },
    });
    const withComparison: MetricViewModel = {
      ...returningRate,
      comparison: {
        mode: "previous_period",
        dataPeriod: { startDate: "2025-07-08", endDate: "2025-08-07" },
        value: { kind: "rate_basis_points", value: 1_000 },
      },
    };
    const display = mapDashboardPageToDisplayData(pageWith([withComparison]), "production");
    expect(display.comparisonValues?.["customers.returning_rate"]).toEqual({
      label: "vs. previous period",
      value: "+20%",
      direction: "up",
    });
  });

  it("reports a comparison as unavailable rather than dividing by a zero baseline", () => {
    const returningRate = createMetricViewModel({
      metricKey: "customers.returning_rate",
      environment: "production",
      dataPeriod,
      sources: [shopifyCurrent],
      value: { kind: "rate_basis_points", value: 500 },
    });
    const withComparison: MetricViewModel = {
      ...returningRate,
      comparison: {
        mode: "previous_year",
        dataPeriod: { startDate: "2024-08-08", endDate: "2025-08-07" },
        value: { kind: "rate_basis_points", value: 0 },
      },
    };
    const display = mapDashboardPageToDisplayData(pageWith([withComparison]), "production");
    expect(display.comparisonValues?.["customers.returning_rate"]).toEqual({
      label: "vs. previous year",
      value: null,
    });
  });

  it("states a source problem in plain language instead of printing warning codes", () => {
    const degraded: SourceStatus = {
      ...shopifyCurrent,
      state: "partial",
      completeness: "partial",
      warningCodes: ["DATASET_UNAVAILABLE", "DATASET:shopify-geography", "PARTIAL_DATASET_FAILURE"],
    };
    const display = mapDashboardPageToDisplayData(pageWith([], [degraded]), "production");
    const shopify = display.sources.find((source) => source.label === "Shopify");

    expect(shopify?.detail).toBe("Some figures could not be loaded");
    // The dataset tag is log telemetry and must never reach the surface.
    expect(shopify?.detail).not.toContain("DATASET");
    expect(shopify?.detail).not.toContain("_");
  });

  it("leaves a healthy source uncaptioned rather than restating completeness", () => {
    const display = mapDashboardPageToDisplayData(pageWith([], [shopifyCurrent]), "production");
    const shopify = display.sources.find((source) => source.label === "Shopify");

    expect(shopify?.state).toBe("current");
    expect(shopify?.detail).toBeUndefined();
  });

  it("discloses a cached fallback without exposing the cache mechanism", () => {
    const stale: SourceStatus = {
      ...shopifyCurrent,
      state: "stale",
      warningCodes: ["CACHE_STALE_FALLBACK"],
    };
    const display = mapDashboardPageToDisplayData(pageWith([], [stale]), "production");

    expect(display.sources.find((source) => source.label === "Shopify")?.detail).toBe(
      "Showing the last confirmed values",
    );
  });
});

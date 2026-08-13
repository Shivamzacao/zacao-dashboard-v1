import { describe, expect, it } from "vitest";

import {
  buildBillingGeographyBreakdown,
  buildProductSalesBreakdown,
  buildPurchaseHeatmapBreakdown,
  buildSalesTotalsMetrics,
  buildSalesTrendSeries,
} from "@/src/application/metrics";
import type { MetricServiceContext } from "@/src/application/metrics/types";
import type { SourceStatus } from "@/src/domain/contracts";

const shopifyCurrent: SourceStatus = {
  source: "shopify",
  state: "current",
  checkedAt: "2026-08-08T00:00:00Z",
  lastSuccessfulAt: "2026-08-08T00:00:00Z",
  dataAsOf: "2026-08-08T00:00:00Z",
  completeness: "complete",
  warningCodes: [],
};

const context: MetricServiceContext = {
  environment: "production",
  dataPeriod: { startDate: "2025-08-08", endDate: "2026-08-07" },
  sourceStatuses: [shopifyCurrent],
};

const totals = {
  orders: 174,
  grossSalesMinorUnits: 8_501_075,
  discountsMinorUnits: -1_211_050,
  returnsMinorUnits: 0,
  netSalesMinorUnits: 1_615_354,
  shippingChargesMinorUnits: 0,
  taxesMinorUnits: 320,
  totalSalesMinorUnits: 1_615_674,
  averageOrderValueMinorUnits: 11_424,
};

describe("DEC-015 canonical sales pass-through", () => {
  it("passes every provider aggregate through verbatim, preserving signs", () => {
    const metrics = buildSalesTotalsMetrics(context, totals);
    const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
    expect(byKey.get("commerce.net_sales")?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 1_615_354 },
    });
    expect(byKey.get("commerce.orders")?.value).toEqual({ kind: "count", value: 174 });
    // AOV is the provider value, never re-divided (16153.54 / 174 would be 9284).
    expect(byKey.get("commerce.average_order_value")?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 11_424 },
    });
    // Discounts keep their provider-negative sign; nothing is subtracted twice.
    expect(byKey.get("commerce.discounts")?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: -1_211_050 },
    });
    expect(byKey.get("commerce.returns")?.readiness.state).toBe("current");
  });

  it("returns nulls, never zeros, when the provider aggregate is absent", () => {
    for (const metric of buildSalesTotalsMetrics(context, null)) {
      expect(metric.value).toBeNull();
    }
  });

  it("builds a monthly net-sales trend keyed to the canonical period total", () => {
    const series = buildSalesTrendSeries(
      context,
      [
        { period: "2026-06-01", netSalesMinorUnits: 100_00 },
        { period: "2026-07-01", netSalesMinorUnits: 250_00 },
      ],
      "month",
      totals.netSalesMinorUnits,
    );
    expect(series.metric.key).toBe("commerce.sales_trend");
    expect(series.metric.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 1_615_354 },
    });
    expect(series.points).toHaveLength(2);
    expect(series.points[1]?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 25_000 },
    });
  });
});

describe("purchase timing and geography breakdowns", () => {
  it("maps day/hour order counts without inventing values", () => {
    const breakdown = buildPurchaseHeatmapBreakdown(context, [
      { dayOfWeek: "Friday", hourOfDay: "13", orders: 6 },
      { dayOfWeek: "Saturday", hourOfDay: "10", orders: 4 },
    ]);
    expect(breakdown.metric.value).toEqual({ kind: "count", value: 10 });
    expect(breakdown.items[0]).toMatchObject({ key: "Friday:13", label: "Friday 13" });
    expect(buildPurchaseHeatmapBreakdown(context, []).metric.value).toBeNull();
  });

  it("keeps billing geography aggregate-only with region labels", () => {
    const breakdown = buildBillingGeographyBreakdown(context, [
      { country: "United States", region: "New York", orders: 80, totalSalesMinorUnits: 900_010 },
      { country: "Canada", region: null, orders: 5, totalSalesMinorUnits: 50_000 },
    ]);
    expect(breakdown.metric.value).toEqual({ kind: "count", value: 85 });
    expect(breakdown.metric.warnings).toContain("BILLING_GEOGRAPHY_AGGREGATE_ONLY");
    expect(breakdown.items.map(({ label }) => label)).toEqual([
      "New York, United States",
      "Canada",
    ]);
  });
});

describe("product sales breakdown", () => {
  it("sums merchandise net sales by SKU and excludes non-merchandise rows", () => {
    const breakdown = buildProductSalesBreakdown(context, [
      {
        product: "70% Cacao",
        variant: "10-Pack",
        sku: "ZAC-DC-70-10PK",
        merchandise: true,
        netSalesMinorUnits: 676_132,
      },
      {
        product: "(blank product)",
        variant: null,
        sku: null,
        merchandise: false,
        netSalesMinorUnits: -1_000,
      },
    ]);
    expect(breakdown.metric.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 676_132 },
    });
    expect(breakdown.metric.warnings).toContain("NON_MERCHANDISE_ROWS_EXCLUDED");
    expect(breakdown.items).toHaveLength(1);
  });

  it("qualifies labels with the variant so sibling SKUs never share a label", () => {
    const breakdown = buildProductSalesBreakdown(context, [
      {
        product: "70% Cacao Dark Chocolate",
        variant: "4-Pack",
        sku: "ZAC-DC-70-4PK",
        merchandise: true,
        netSalesMinorUnits: 26_900,
      },
      {
        product: "70% Cacao Dark Chocolate",
        variant: "10-Pack",
        sku: "ZAC-DC-70-10PK",
        merchandise: true,
        netSalesMinorUnits: 14_400,
      },
      {
        product: "Origin Bar",
        variant: "Default Title",
        sku: "ZAC-OB",
        merchandise: true,
        netSalesMinorUnits: 3_600,
      },
    ]);
    expect(breakdown.items.map(({ label }) => label)).toEqual([
      "70% Cacao Dark Chocolate · 4-Pack",
      "70% Cacao Dark Chocolate · 10-Pack",
      "Origin Bar",
    ]);
  });

  it("falls back to the SKU when sibling variants share a title", () => {
    const breakdown = buildProductSalesBreakdown(context, [
      {
        product: "Limited Drop",
        variant: null,
        sku: "ZAC-LD-A",
        merchandise: true,
        netSalesMinorUnits: 10_000,
      },
      {
        product: "Limited Drop",
        variant: null,
        sku: "ZAC-LD-B",
        merchandise: true,
        netSalesMinorUnits: 5_000,
      },
    ]);
    expect(breakdown.items.map(({ label }) => label)).toEqual([
      "Limited Drop · ZAC-LD-A",
      "Limited Drop · ZAC-LD-B",
    ]);
  });
});

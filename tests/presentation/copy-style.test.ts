import { describe, expect, it } from "vitest";

import { metricCatalog } from "@/src/domain/metrics/catalog";
import { metricDisplayLabel } from "@/src/presentation/features/dashboard-pages/metric-copy";
import { dashboardPageSpecs } from "@/src/presentation/features/dashboard-pages/page-specs";
import { dashboardRoutes } from "@/src/presentation/shell/routes";

describe("production dashboard copy style", () => {
  it("uses complete sentences for page, chart, and table descriptions", () => {
    const descriptions = [
      ...dashboardRoutes.map(({ description }) => description),
      ...Object.values(dashboardPageSpecs).flatMap(({ charts, tables }) => [
        ...charts.map(({ description }) => description),
        ...tables.map(({ description }) => description),
      ]),
    ];

    expect(descriptions.every((description) => /[.!?]$/.test(description))).toBe(true);
  });

  it("keeps headings unpunctuated and removes ambiguous separators", () => {
    const titles = Object.values(dashboardPageSpecs).flatMap(({ charts, tables }) => [
      ...charts.map(({ title }) => title),
      ...tables.map(({ title }) => title),
    ]);
    const labels = metricCatalog.map(metricDisplayLabel);

    expect([...titles, ...labels].every((label) => !/[.!?]$/.test(label))).toBe(true);
    expect([...titles, ...labels].filter((label) => label !== "S&OP validation")).not.toContain(
      expect.stringMatching(/\s[&/]\s|[A-Za-z]\/[A-Za-z]/),
    );
  });

  it("uses sentence case while preserving approved initialisms", () => {
    const labelsByKey = new Map(
      metricCatalog.map((metric) => [metric.key, metricDisplayLabel(metric)]),
    );

    expect(labelsByKey.get("executive.business_health_score")).toBe("Business health score");
    expect(labelsByKey.get("products.sales")).toBe("Product and SKU sales");
    expect(labelsByKey.get("inventory.runway_reorder")).toBe("Inventory runway and reorder alert");
    expect(labelsByKey.get("social.performance")).toBe("Social audience growth");
    expect(labelsByKey.get("finance.actual_margin")).toBe("Actual gross margin");
    expect(labelsByKey.get("quality.sop_validation")).toBe("S&OP validation");

    expect(dashboardPageSpecs.customers.charts[3]?.series?.map(({ label }) => label)).toEqual([
      "30 days",
      "60 days",
      "90 days",
      "180 days",
      "Lifetime",
    ]);
  });

  it("keeps domain and API catalog labels unchanged", () => {
    expect(metricCatalog.find(({ key }) => key === "products.sales")?.label).toBe(
      "Product/SKU sales",
    );
    expect(metricCatalog.find(({ key }) => key === "finance.actual_margin")?.label).toBe(
      "Actual Gross Margin",
    );
  });
});

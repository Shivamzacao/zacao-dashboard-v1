// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";

import { drilldownCatalog } from "@/src/application/api";
import { metricCatalog } from "@/src/domain/metrics/catalog";
import { DashboardPageView } from "@/src/presentation/features/dashboard-pages/dashboard-page.client";
import { dashboardPageSpecs } from "@/src/presentation/features/dashboard-pages/page-specs";
import { f3PageFixtureData } from "@/src/presentation/fixtures/f3-page-data";
import { dashboardRoutes } from "@/src/presentation/shell/routes";

afterEach(cleanup);

describe("F3 dashboard pages", () => {
  it("maps every page element to an approved B7 metric and drill-down contract", () => {
    const metrics = new Set(metricCatalog.map(({ key }) => key));
    const datasets = new Set(drilldownCatalog.map(({ dataset }) => dataset));
    expect(new Set(Object.keys(dashboardPageSpecs))).toEqual(
      new Set(dashboardRoutes.map(({ slug }) => slug)),
    );
    for (const page of Object.values(dashboardPageSpecs)) {
      for (const key of page.kpis) expect(metrics.has(key), `${page.slug}: ${key}`).toBe(true);
      for (const chart of page.charts) {
        expect(metrics.has(chart.metricKey), `${page.slug}: ${chart.metricKey}`).toBe(true);
        if (chart.secondaryMetricKey) expect(metrics.has(chart.secondaryMetricKey)).toBe(true);
      }
      for (const table of page.tables) {
        expect(metrics.has(table.metricKey), `${page.slug}: ${table.metricKey}`).toBe(true);
        if (table.dataset)
          expect(datasets.has(table.dataset), `${page.slug}: ${table.dataset}`).toBe(true);
      }
    }
  });

  it("renders Executive truthfully without converting blocked metrics to zero", () => {
    render(<DashboardPageView spec={dashboardPageSpecs.executive} fixture={f3PageFixtureData} />);
    expect(screen.getByLabelText("Key performance indicators")).toBeTruthy();
    expect(screen.getAllByText("Business rule required").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Returning customer rate: 38.4%")).toBeTruthy();
    expect(screen.getByText("Leadership attention")).toBeTruthy();
  });

  it("uses the approved F2 table, drill-down, and export path for Product Intelligence", () => {
    render(<DashboardPageView spec={dashboardPageSpecs.products} fixture={f3PageFixtureData} />);
    expect(screen.getByRole("table", { name: "Product catalog" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Export CSV" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /View details for/ })).toHaveLength(6);
    expect(screen.getByText("Inventory runway & reorder")).toBeTruthy();
  });

  it("renders Klaviyo as no activity and keeps attribution blocked independently", () => {
    render(<DashboardPageView spec={dashboardPageSpecs.marketing} fixture={f3PageFixtureData} />);
    expect(screen.getAllByText("No activity").length).toBeGreaterThan(0);
    expect(screen.getByText("Attribution boundary")).toBeTruthy();
    expect(screen.getByText(/Marketing spend supplies spend only/)).toBeTruthy();
  });

  it("keeps conditional Growth and Financial pages structurally complete without fake values", () => {
    const { rerender } = render(
      <DashboardPageView spec={dashboardPageSpecs.growth} fixture={f3PageFixtureData} />,
    );
    expect(screen.getAllByText("Data pending").length).toBeGreaterThan(0);
    expect(screen.getByText("Conditional module")).toBeTruthy();
    rerender(<DashboardPageView spec={dashboardPageSpecs.financial} fixture={f3PageFixtureData} />);
    expect(screen.getByText("Financial activation")).toBeTruthy();
    expect(screen.getAllByText("Business rule required").length).toBeGreaterThan(0);
  });

  it("has no automated accessibility violations in a representative complete page", async () => {
    const { container } = render(
      <DashboardPageView spec={dashboardPageSpecs.insights} fixture={f3PageFixtureData} />,
    );
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});

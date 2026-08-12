// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    expect(screen.getAllByText("Data pending").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Returning customer rate: 38.4%")).toBeTruthy();
    expect(screen.queryByText("Deterministic V1 rules")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(9);
  });

  it("renders certified alerts and omits the attention section when none exist", () => {
    const alertFixture = {
      ...f3PageFixtureData,
      alerts: [
        {
          key: "alerts.low_inventory:SYNTH-LOW-01",
          severity: "warning" as const,
          title: "SYNTH-LOW-01 is below its reorder point",
          description: "46 on hand against an approved reorder point of 110.",
          metadata: ["Inventory risk", "SYNTH-LOW-01", "Reorder point 110"],
        },
      ],
    };
    const { rerender } = render(
      <DashboardPageView spec={dashboardPageSpecs.executive} fixture={alertFixture} />,
    );
    expect(screen.getByRole("region", { name: "Needs attention" })).toBeTruthy();
    expect(screen.getByText("SYNTH-LOW-01 is below its reorder point")).toBeTruthy();

    rerender(
      <DashboardPageView
        spec={dashboardPageSpecs.executive}
        fixture={{ ...f3PageFixtureData, alerts: [] }}
      />,
    );
    expect(screen.queryByRole("region", { name: "Needs attention" })).toBeNull();
  });

  it("uses the approved F2 table, drill-down, and export path for Product Intelligence", async () => {
    render(<DashboardPageView spec={dashboardPageSpecs.products} fixture={f3PageFixtureData} />);
    expect(screen.getByRole("table", { name: "Product catalog" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Export CSV" })).toHaveLength(2);
    const viewButtons = screen.getAllByRole("button", { name: /View details for/ });
    expect(viewButtons).toHaveLength(6);

    await userEvent.click(viewButtons[0]!);
    expect(screen.getByRole("dialog", { name: "Product catalog detail" })).toBeTruthy();
    expect(screen.getAllByText("Synthetic Dark Bar").length).toBeGreaterThan(1);
    expect(screen.getByText("Inventory Runway & Reorder Alert")).toBeTruthy();
  });

  it("renders Klaviyo as no activity and keeps attribution blocked independently", () => {
    render(<DashboardPageView spec={dashboardPageSpecs.marketing} fixture={f3PageFixtureData} />);
    expect(screen.getAllByText("No activity").length).toBeGreaterThan(0);
    expect(screen.getByText(/Spend from the approved workbook/)).toBeTruthy();
  });

  it("keeps conditional Growth and Financial pages structurally complete without fake values", () => {
    const { rerender } = render(
      <DashboardPageView spec={dashboardPageSpecs.growth} fixture={f3PageFixtureData} />,
    );
    expect(screen.getAllByText("Data pending").length).toBeGreaterThan(0);
    rerender(<DashboardPageView spec={dashboardPageSpecs.financial} fixture={f3PageFixtureData} />);
    expect(screen.getAllByText("Data pending").length).toBeGreaterThan(0);
  });

  it("renders live catalog rows as readable columns without provider URIs", () => {
    // The shape live Shopify produces: GID-bearing rows and minor-unit prices.
    const live = {
      ...f3PageFixtureData,
      synthetic: false,
      rowsByDataset: {
        "product-catalog": [
          {
            product: "70% Cacao Dark Chocolate",
            variant: "4-Pack",
            sku: "ZAC-DC-70-4PK",
            status: "ACTIVE",
            priceMinorUnits: 3600,
          },
          {
            product: "Zacao Gift Card",
            variant: "$25.00",
            sku: null,
            status: "ACTIVE",
            priceMinorUnits: 2500,
          },
        ],
      },
      chartData: {
        ...f3PageFixtureData.chartData,
        "inventory.shopify_current": [
          {
            key: "gid://shopify/Location/111934701875:ZAC-DC-70-4PK:reserved",
            label: "70% Cacao Dark Chocolate · 4-Pack · Reserved",
            value: 2,
          },
        ],
      },
    };
    const { container } = render(
      <DashboardPageView spec={dashboardPageSpecs.products} fixture={live} />,
    );
    const catalog = screen.getByRole("table", { name: "Product catalog" });
    expect(
      [...catalog.querySelectorAll("thead th")].map((cell) =>
        cell.textContent?.replace(/[↕↑↓]/g, ""),
      ),
    ).toEqual(["Product", "Variant", "Status", "Price", "Details"]);
    expect(screen.getByText("$36.00")).toBeTruthy();
    expect(screen.getAllByText("Active").length).toBe(2);
    expect(container.textContent).not.toContain("gid://");
    expect(container.textContent).not.toContain("ZAC-DC-70-4PK · Reserved");
  });

  it("has no automated accessibility violations in a representative complete page", async () => {
    const { container } = render(
      <DashboardPageView spec={dashboardPageSpecs.insights} fixture={f3PageFixtureData} />,
    );
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});

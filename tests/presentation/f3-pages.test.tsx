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
import { f3CustomerPageFixtureData } from "@/src/presentation/fixtures/f3-page-data";
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
      for (const kpi of page.kpis) {
        expect(metrics.has(kpi.metricKey), `${page.slug}: ${kpi.metricKey}`).toBe(true);
      }
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
    expect(screen.getByLabelText("Website sessions: 1,280")).toBeTruthy();
    expect(screen.queryByText("Deterministic V1 rules")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(9);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map(({ textContent }) => textContent),
    ).toEqual([
      "Sales momentum",
      "Fulfillment health",
      "Units sold",
      "Product revenue",
      "Source readiness",
      "Revenue mix by channel",
      "Per-bar COGS versus target",
      "Input cost movement",
      "Manufacturer delivery performance",
      "Inventory on hand by channel",
    ]);
    expect(screen.getAllByText(/^Source:/)).toHaveLength(19);
    expect(screen.getAllByText("Source: Fairafric")).toHaveLength(3);
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
    expect(screen.getByText("Medium")).toBeTruthy();

    rerender(
      <DashboardPageView
        spec={dashboardPageSpecs.executive}
        fixture={{ ...f3PageFixtureData, alerts: [] }}
      />,
    );
    expect(screen.queryByRole("region", { name: "Needs attention" })).toBeNull();
  });

  it("renders the complete Revenue Intelligence HTML composition in the approved order", () => {
    const revenue = dashboardPageSpecs.revenue;
    expect(revenue.kpis.map(({ metricKey }) => metricKey)).toEqual([
      "commerce.gross_sales",
      "commerce.discounts",
      "commerce.returns",
      "commerce.total_sales",
      "commerce.orders",
      "commerce.average_order_value",
      "revenue.dtc_total",
      "revenue.retail_total",
    ]);
    expect(revenue.charts.map(({ title }) => title)).toEqual([
      "Revenue trend",
      "Units sold",
      "Purchase timing",
      "Revenue mix by channel",
      "Margin by channel",
      "Sales by SKU",
    ]);
    expect(revenue.tables.map(({ title }) => title)).toEqual([
      "Detailed orders",
      "Channel performance",
    ]);

    render(<DashboardPageView spec={revenue} fixture={f3PageFixtureData} />);
    expect(screen.getAllByRole("article")).toHaveLength(8);
    expect(screen.getByLabelText("DTC revenue (total): $10,260.00")).toBeTruthy();
    expect(screen.getByLabelText("Wholesale & in-store revenue: $3,750.00")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Product revenue" })).toBeNull();
    expect(screen.getByText("Business rule required")).toBeTruthy();
    expect(screen.getByText(/Margin is unavailable until landed COGS/)).toBeTruthy();
    expect(screen.getAllByText("Source: Shopify").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Source: Shopify + Faire")).toBeTruthy();
    expect(screen.getByText("Source: Shopify + mapping / cost sources")).toBeTruthy();

    const table = screen.getByRole("table", { name: "Channel performance" });
    expect(
      [...table.querySelectorAll("thead th")].map((cell) =>
        cell.textContent?.replace(/[↕↑↓]/g, ""),
      ),
    ).toEqual(["Channel", "Revenue", "Orders", "Average order value", "Margin", "Details"]);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(9);
  });

  it("renders the complete Customer Intelligence HTML composition in the approved order", () => {
    const customers = dashboardPageSpecs.customers;
    expect(customers.kpis.map(({ metricKey }) => metricKey)).toEqual([
      "customers.new_count",
      "customers.returning_count",
      "customers.returning_rate",
      "customers.active",
      "customers.realized_ltv",
      "engagement.time_on_site",
      "marketing.cac",
      "marketing.ltv_cac",
      "klaviyo.email_open_rate",
    ]);
    expect(customers.charts.map(({ title }) => title)).toEqual([
      "New and returning customers",
      "Store funnel",
      "Customer cohorts",
      "Customers by city",
      "Age mix",
      "Gender mix",
    ]);
    expect(customers.tables.map(({ title }) => title)).toEqual(["Email campaign performance"]);

    render(<DashboardPageView spec={customers} fixture={f3CustomerPageFixtureData} />);
    expect(screen.getAllByRole("article")).toHaveLength(9);
    expect(screen.getByLabelText("Time on site: 3m 12s")).toBeTruthy();
    expect(screen.getAllByText("Business rule required")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Customer geography" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Customers by city" })).toBeTruthy();
    expect(screen.getAllByText(/reporting-period filters do not apply/)).toHaveLength(2);
    const table = screen.getByRole("table", { name: "Email campaign performance" });
    expect(
      [...table.querySelectorAll("thead th")].map((cell) =>
        cell.textContent?.replace(/[↕↑↓]/g, ""),
      ),
    ).toEqual(["Campaign", "Sent", "Open rate", "Click rate", "Revenue", "Details"]);
    expect(screen.getByText("Welcome flow")).toBeTruthy();
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
    expect(screen.getByText("Inventory runway and reorder alert")).toBeTruthy();
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

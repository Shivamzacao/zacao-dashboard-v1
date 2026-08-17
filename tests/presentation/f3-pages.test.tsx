// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";

import { drilldownCatalog } from "@/src/application/api";
import { metricCatalog } from "@/src/domain/metrics/catalog";
import { DashboardPageView } from "@/src/presentation/features/dashboard-pages/dashboard-page.client";
import { dashboardPageSpecs } from "@/src/presentation/features/dashboard-pages/page-specs";
import {
  f3CustomerPageFixtureData,
  f3FinancialPageFixtureData,
  f3GrowthPageFixtureData,
  f3MarketingPageFixtureData,
  f3OperationsPageFixtureData,
  f3PageFixtureData,
  f3ProductPageFixtureData,
} from "@/src/presentation/fixtures/f3-page-data";
import { dashboardRoutes } from "@/src/presentation/shell/routes";

afterEach(cleanup);

describe("F3 dashboard pages", () => {
  it("keeps the Product COGS chart on the same metric as its KPI", () => {
    // These describe one quantity — landed cost per bar against target. The chart
    // previously pointed at manufacturing.cogs_trend, which no contributor emits,
    // so it rendered blocked directly beneath a KPI that was working.
    const products = dashboardPageSpecs.products;
    const kpiKeys = products.kpis.map((kpi) => (typeof kpi === "string" ? kpi : kpi.metricKey));
    const cogsChart = products.charts.find(({ title }) => title === "Per-bar COGS versus target");
    expect(cogsChart?.metricKey).toBe("manufacturing.cogs_per_bar");
    expect(kpiKeys).toContain(cogsChart?.metricKey);
  });

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
    // Margin is no longer rule-blocked, so no card on this page reports that
    // state. The table's coverage note now discloses the provisional fee rates
    // instead of claiming the metric cannot be produced at all.
    expect(screen.queryByText("Business rule required")).toBeNull();
    expect(screen.getByText(/Margin is provisional/)).toBeTruthy();
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
      "customers.ltv_90d",
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
    expect(screen.getAllByRole("article")).toHaveLength(10);
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

  it("matches the HTML Product Intelligence composition and table presentation", async () => {
    const products = dashboardPageSpecs.products;
    expect(products.kpis.map(({ metricKey }) => metricKey)).toEqual([
      "products.units_sold",
      "products.sku_velocity",
      "inventory.on_hand_bars",
      "inventory.value",
      "quality.missing_sku_cost",
      "inventory.sell_through",
      "inventory.weeks_cover",
      "products.cogs_flags",
      "manufacturing.cogs_per_bar",
    ]);
    expect(products.charts.map(({ title }) => title)).toEqual([
      "Product demand",
      "Product mix",
      "Inventory position",
      "SKU velocity",
      "Sales by SKU",
      "Margin by SKU",
      "Stock versus ideal band",
      "Per-bar COGS versus target",
    ]);
    expect(products.tables.map(({ title }) => title)).toEqual([
      "Product catalog",
      "SKU margin & cost",
    ]);
    expect(products.charts.at(-1)?.series?.[1]).toMatchObject({ pattern: "dashed" });

    render(<DashboardPageView spec={products} fixture={f3ProductPageFixtureData} />);
    expect(
      screen
        .getByRole("region", { name: "Key performance indicators" })
        .querySelectorAll("article"),
    ).toHaveLength(9);
    expect(screen.getByRole("table", { name: "Product catalog" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "SKU margin & cost" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Export CSV" })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Inventory runway & reorder" })).toBeNull();
    expect(screen.getByText("Matcha 60% COGS is trending above target")).toBeTruthy();
    expect(screen.getByText("Below band")).toBeTruthy();
    const viewButtons = screen.getAllByRole("button", { name: /View details for/ });
    expect(viewButtons).toHaveLength(8);

    await userEvent.click(viewButtons[0]!);
    expect(screen.getByRole("dialog", { name: "Product catalog detail" })).toBeTruthy();
    expect(screen.getAllByText("Dark 70%").length).toBeGreaterThan(1);
  });

  it("matches the HTML Operations Intelligence composition and conditional packaging alert", () => {
    const operations = dashboardPageSpecs.operations;
    expect(operations.kpis.map(({ metricKey }) => metricKey)).toEqual([
      "inventory.shopify_current",
      "operations.shipped_delivered",
      "inventory.combined",
      "forecast.variance",
      "production.incoming",
      "operations.manufacturer_otif",
      "operations.manufacturer_lead_time",
      "operations.warehouse_on_time_accuracy",
      "operations.refund_rate",
      "inventory.stock_health",
    ]);
    expect(operations.charts.map(({ title }) => title)).toEqual([
      "Fulfillment status",
      "Combined inventory",
      "Forecast variance",
      "Additional depletions",
      "Projected delivery timeline",
      "Stock versus ideal band",
      "Packaging material stock",
      "Packaging stock projection",
      "Manufacturer delivery performance",
    ]);
    expect(operations.tables.map(({ title }) => title)).toEqual([
      "Inventory lots & FEFO",
      "Incoming production schedule",
      "Packaging material stock",
    ]);
    render(<DashboardPageView spec={operations} fixture={f3OperationsPageFixtureData} />);
    expect(screen.getAllByRole("article")).toHaveLength(11);
    expect(screen.getByText("Cartons (12ct) are below the ideal band")).toBeTruthy();
    expect(screen.getByText("Medium")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Packaging material stock" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Incoming production" })).toBeNull();
  });

  it("renders the complete Marketing Intelligence HTML composition in the approved order", () => {
    const marketing = dashboardPageSpecs.marketing;
    expect(marketing.kpis.map(({ metricKey }) => metricKey)).toEqual([
      "klaviyo.email_recipients",
      "klaviyo.email_delivery_rate",
      "klaviyo.email_open_rate",
      "klaviyo.email_click_rate",
      "klaviyo.attributed_revenue",
      "marketing.paid_cac",
      "social.followers_total",
      "collabs.active",
      "ambassadors.active",
      "ambassadors.sessions",
      "ambassadors.revenue",
    ]);
    expect(marketing.charts.map(({ title }) => title)).toEqual([
      "Marketing spend",
      "Email conversion funnel",
      "Email engagement",
      "Follower growth by channel",
      "Collaboration reach",
      "Collaborations by category",
      "Web traffic by source",
      "Social mentions by channel",
      "Affiliate ROI by message",
      "Campaign ROI",
    ]);
    expect(marketing.tables.map(({ title }) => title)).toEqual([
      "Klaviyo flows",
      "Social channel performance",
      "Top ambassadors",
      "Brand collaborations",
    ]);

    render(<DashboardPageView spec={marketing} fixture={f3MarketingPageFixtureData} />);
    expect(screen.getAllByRole("article")).toHaveLength(11);
    expect(screen.getByLabelText("Email recipients: 2,840")).toBeTruthy();
    expect(screen.getByLabelText("Affiliate-driven revenue: $2,100.00")).toBeTruthy();
    expect(screen.getAllByText("Business rule required")).toHaveLength(2);
    expect(screen.getAllByText("Opens").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Clicks").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Store conversion funnel" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Campaign performance" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Klaviyo campaigns" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Needs attention" })).toBeNull();
    expect(screen.getAllByText(/^Source:/)).toHaveLength(25);

    const table = screen.getByRole("table", { name: "Social channel performance" });
    expect(
      [...table.querySelectorAll("thead th")].map((cell) =>
        cell.textContent?.replace(/[↕↑↓]/g, ""),
      ),
    ).toEqual(["Channel", "Followers", "Growth rate", "Revenue", "Audience reach", "Details"]);
  });

  it("renders the complete Growth Intelligence HTML composition in the approved order", () => {
    const growth = dashboardPageSpecs.growth;
    expect(growth.kpis.map(({ metricKey }) => metricKey)).toEqual([
      "growth.open_pipeline_value",
      "growth.closed_pipeline",
      "partners.performance",
      "social.performance",
      "growth.weighted_pipeline",
      "growth.time_to_close",
      "growth.time_to_close_target",
      "investors.count",
      "grants.secured",
      "grants.submitted",
      "grants.acceptance_rate",
    ]);
    expect(growth.charts.map(({ title }) => title)).toEqual([
      "Pipeline by type",
      "Partner performance",
      "Social performance",
      "Weighted pipeline by industry",
      "Grant applications submitted",
    ]);
    expect(growth.tables.map(({ title }) => title)).toEqual([
      "Partner performance",
      "Next actions",
      "Investor pipeline",
      "Grant applications",
    ]);

    render(<DashboardPageView spec={growth} fixture={f3GrowthPageFixtureData} />);
    expect(screen.getAllByRole("article")).toHaveLength(11);
    expect(screen.getByLabelText("Open pipeline: $385,000.00")).toBeTruthy();
    expect(screen.getByLabelText("Average time to close: 4.8 months")).toBeTruthy();
    expect(screen.getByLabelText("Grant acceptance rate: 35.7%")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Needs attention" })).toBeNull();
    expect(screen.getAllByText(/^Source:/)).toHaveLength(20);
    expect(growth.tables.map(({ span }) => span)).toEqual([2, 2, 2, 2]);

    const investorTable = screen.getByRole("table", { name: "Investor pipeline" });
    expect(
      [...investorTable.querySelectorAll("thead th")].map((cell) =>
        cell.textContent?.replace(/[↕↑↓]/g, ""),
      ),
    ).toEqual(["Investor", "Stage", "Interest level", "Check size", "Next step", "Details"]);
  });

  it("renders the complete Financial Intelligence HTML composition truthfully", () => {
    const financial = dashboardPageSpecs.financial;
    expect(financial.kpis.map(({ metricKey }) => metricKey)).toEqual([
      "commerce.total_sales",
      "finance.actual_expenses",
      "finance.actual_margin",
      "finance.cash_position",
      "inventory.value",
      "finance.monthly_burn",
      "finance.cash_runway",
      "finance.effective_cogs",
      "finance.rebate_tier",
    ]);
    expect(financial.charts.map(({ title }) => title)).toEqual([
      "Expense composition",
      "Cash position",
      "Production cost & payment",
      "Budget versus actual",
      "Margin by channel",
      "Fairafric volume rebate tiers",
    ]);
    expect(financial.tables).toEqual([]);
    expect(financial.charts[3]?.series?.[1]).toMatchObject({
      label: "Plan",
      pattern: "dashed",
    });

    render(<DashboardPageView spec={financial} fixture={f3FinancialPageFixtureData} />);
    expect(
      screen
        .getByRole("region", { name: "Key performance indicators" })
        .querySelectorAll("article"),
    ).toHaveLength(9);
    expect(screen.getByLabelText("Actual operating expenses: $35,700.00")).toBeTruthy();
    expect(screen.getByLabelText("Cash position: $248,000.00")).toBeTruthy();
    // Three, not four: contribution margin by channel also appears on this page
    // and is no longer rule-blocked now that the channel fee table exists.
    expect(screen.getAllByText("Business rule required")).toHaveLength(3);
    expect(screen.getAllByText("Data pending")).toHaveLength(3);
    expect(screen.getAllByText("Actual").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Plan").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Source: Fairafric")).toHaveLength(3);
    expect(screen.queryByRole("region", { name: "Needs attention" })).toBeNull();
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

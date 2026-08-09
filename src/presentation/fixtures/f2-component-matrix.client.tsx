"use client";

import { useCallback, useRef, useState } from "react";

import {
  ChartCard,
  InsightCard,
  KpiCard,
  ReadinessCard,
  SourceIndicator,
  WarningCard,
} from "@/src/presentation/components/dashboard/cards";
import {
  AreaChartView,
  DonutChartView,
  FunnelChartView,
  HeatmapChartView,
  HorizontalBarChartView,
  LineChartView,
  SparklineChartView,
  StackedBarChartView,
  VerticalBarChartView,
} from "@/src/presentation/components/dashboard/charts.client";
import {
  DataTable,
  type DashboardTableColumn,
} from "@/src/presentation/components/dashboard/data-table.client";
import { DetailDrawer } from "@/src/presentation/components/dashboard/detail-drawer.client";
import {
  ExportStatus,
  type ExportState,
} from "@/src/presentation/components/dashboard/export-status.client";
import { StateSurface } from "@/src/presentation/components/dashboard/state-surface";
import { AccessibleTooltip } from "@/src/presentation/components/dashboard/tooltip-legend";

const trend = [
  { key: "aug", label: "Aug", value: 14200, secondaryValue: 11800 },
  { key: "sep", label: "September with a long label", value: 0, secondaryValue: 12600 },
  { key: "oct", label: "Oct", value: -1200, secondaryValue: 13200 },
  { key: "nov", label: "Nov", value: 17400, secondaryValue: null },
  { key: "dec", label: "Dec", value: 22100, secondaryValue: 19800 },
] as const;
const breakdown = [
  { key: "smooth", label: "Smooth Chocolate", value: 48 },
  { key: "dark", label: "Dark Chocolate", value: 34 },
  { key: "gift", label: "Gift card", value: 18 },
] as const;
const legend = [
  { key: "actual", label: "Actual", tone: "forest" },
  { key: "comparison", label: "Comparison", tone: "gold", pattern: "dashed" },
] as const;
const series = [
  { key: "value", label: "Actual", tone: "forest" },
  { key: "secondaryValue", label: "Comparison", tone: "gold" },
] as const;

interface FixtureRow {
  readonly id: string;
  readonly product: string;
  readonly units: number;
  readonly status: string;
}
const columns: readonly DashboardTableColumn<FixtureRow>[] = [
  { key: "product", label: "Product", sortable: true },
  { key: "units", label: "Units", numeric: true, sortable: true },
  { key: "status", label: "Status" },
];
const rows: readonly FixtureRow[] = [
  {
    id: "fixture-1",
    product: "42% Cacao Smooth Chocolate — deliberately long label",
    units: 1240,
    status: "Current",
  },
  { id: "fixture-2", product: "70% Cacao Dark Chocolate", units: 0, status: "No activity" },
  { id: "fixture-3", product: "Synthetic seasonal product", units: -4, status: "Partial" },
];

function TableInteractionFixture() {
  const [page, setPage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportState, setExportState] = useState<ExportState>("idle");
  const drawerTrigger = useRef<HTMLButtonElement>(null);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  return (
    <>
      <ChartCard
        title="Bounded product detail"
        description="Deterministic local fixture sorting; production pagination remains B7 server-controlled."
      >
        <DataTable
          caption="Synthetic product detail"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          state="partial"
          page={page}
          pageSize={3}
          totalRows={7}
          onPageChange={setPage}
          onRowOpen={() => setDrawerOpen(true)}
        />
        <button
          ref={drawerTrigger}
          type="button"
          className="fixture-drawer-trigger"
          onClick={() => setDrawerOpen(true)}
        >
          Open source-limited drawer state
        </button>
        <ExportStatus
          state={exportState}
          onRequest={() => {
            setExportState("requesting");
            globalThis.setTimeout(() => setExportState("success"), 100);
          }}
        />
      </ChartCard>
      <DetailDrawer
        open={drawerOpen}
        title="Synthetic order detail"
        state="source_limited"
        onClose={closeDrawer}
        returnFocusRef={drawerTrigger}
      />
    </>
  );
}

export function F2ComponentMatrix() {
  return (
    <main className="component-fixture-page">
      <header className="component-fixture-header">
        <p className="page-eyebrow">F2 fixture matrix</p>
        <h1>Reusable dashboard components</h1>
        <p>Synthetic TEST fixtures only. These values are not ZACAO business performance.</p>
      </header>
      <section aria-labelledby="kpis-title">
        <h2 id="kpis-title">KPI and state coverage</h2>
        <div className="component-kpi-grid">
          <KpiCard
            model={{
              label: "Net sales",
              value: { kind: "money", value: { currency: "USD", minorUnits: 98765432100 } },
              state: "current",
              comparison: { label: "vs prior period", value: "+12.4%", tone: "positive" },
              sparkline: [2, 5, 4, 8, 7, 11],
            }}
          />
          <KpiCard
            model={{
              label: "Orders",
              value: { kind: "count", value: 0 },
              state: "current",
              comparison: { label: "vs prior period", value: "0%" },
              sparkline: [0, 0, 0],
            }}
          />
          <KpiCard
            model={{
              label: "Refund adjustment with a deliberately long label",
              value: { kind: "money", value: { currency: "USD", minorUnits: -125050 } },
              state: "partial",
              comparison: { label: "comparison", value: null },
            }}
          />
          <KpiCard
            model={{
              label: "Conversion rate",
              value: { kind: "rate_basis_points", value: 264 },
              state: "stale",
              comparison: { label: "vs prior", value: "-0.4%", tone: "warning" },
            }}
          />
          <KpiCard
            model={{
              label: "Contribution margin",
              value: null,
              state: "business_rule_required",
              unavailableReason: "Approved COGS treatment is required.",
            }}
          />
          <KpiCard
            model={{
              label: "Detailed customer history",
              value: null,
              state: "source_limited",
              unavailableReason: "Detailed Shopify history remains limited.",
            }}
          />
        </div>
        <div className="component-state-grid">
          {(
            [
              "loading",
              "empty",
              "no_activity",
              "not_configured",
              "data_pending",
              "business_rule_required",
              "source_limited",
              "partial",
              "stale",
              "invalid",
              "unavailable",
              "error",
            ] as const
          ).map((state) => (
            <StateSurface key={state} state={state} compact />
          ))}
        </div>
      </section>

      <section aria-labelledby="cards-title">
        <h2 id="cards-title">Cards and source indicators</h2>
        <div className="component-card-grid">
          <InsightCard
            title="Revenue improved in the fixture"
            metadata={["Rule-based", "Shopify fixture"]}
          >
            A provider-neutral insight card displays supplied evidence without calculating it.
          </InsightCard>
          <WarningCard
            title="Inventory source is stale"
            severity="warning"
            metadata={["Data quality"]}
          >
            Review the source refresh before making an inventory decision.
          </WarningCard>
          <ReadinessCard
            title="Klaviyo readiness"
            state="no_activity"
            message="Connected source contains no approved performance activity yet."
          />
          <div className="source-fixture">
            <SourceIndicator
              model={{ label: "Shopify", state: "current", dataAsOf: "2026-08-07T14:00:00Z" }}
            />
            <SourceIndicator
              model={{
                label: "Google Sheets",
                state: "stale",
                dataAsOf: "2026-08-01T14:00:00Z",
                detail: "Production source",
              }}
            />
            <AccessibleTooltip label="Values show the last successfully validated source result.">
              <span aria-hidden="true">?</span>
              <span className="sr-only">About source freshness</span>
            </AccessibleTooltip>
          </div>
        </div>
      </section>

      <section aria-labelledby="charts-title">
        <h2 id="charts-title">Approved chart wrappers</h2>
        <div className="component-chart-grid">
          <ChartCard
            eyebrow="Revenue"
            title="Line"
            description="Normal, zero, negative, partial and long-label points."
            footer="Source: synthetic F2 fixture"
          >
            <LineChartView
              title="Revenue trend"
              summary="Synthetic revenue varies across five monthly points; one comparison point is unavailable."
              data={trend}
              state="partial"
              series={series}
              legend={legend}
            />
          </ChartCard>
          <ChartCard eyebrow="Revenue" title="Area">
            <AreaChartView
              title="Area trend"
              summary="Synthetic area trend for wrapper verification."
              data={trend}
              series={series}
              legend={legend}
            />
          </ChartCard>
          <ChartCard eyebrow="Products" title="Vertical bar">
            <VerticalBarChartView
              title="Product mix"
              summary="Three synthetic product categories."
              data={breakdown}
            />
          </ChartCard>
          <ChartCard eyebrow="Products" title="Horizontal bar">
            <HorizontalBarChartView
              title="Units by product"
              summary="Three synthetic product categories arranged horizontally."
              data={breakdown}
            />
          </ChartCard>
          <ChartCard eyebrow="Channels" title="Stacked bar">
            <StackedBarChartView
              title="Channel comparison"
              summary="Synthetic actual and comparison values."
              data={trend}
              series={series}
              legend={legend}
            />
          </ChartCard>
          <ChartCard eyebrow="Customers" title="Heatmap">
            <HeatmapChartView
              title="Cohort heatmap"
              summary="Synthetic labelled cells; intensity is supplemented by text."
              data={breakdown}
            />
          </ChartCard>
          <ChartCard eyebrow="Products" title="Donut">
            <DonutChartView
              title="Product share"
              summary="Synthetic three-category share."
              data={breakdown}
            />
          </ChartCard>
          <ChartCard eyebrow="Marketing" title="Funnel">
            <FunnelChartView
              title="Shopify funnel"
              summary="Synthetic funnel stages decrease from sessions to purchases."
              data={[
                { key: "sessions", label: "Sessions", value: 1000 },
                { key: "cart", label: "Added to cart", value: 240 },
                { key: "checkout", label: "Checkout", value: 120 },
                { key: "orders", label: "Orders", value: 64 },
              ]}
            />
          </ChartCard>
          <ChartCard eyebrow="Compact" title="Sparkline">
            <SparklineChartView
              title="Compact trend"
              summary="Six synthetic points."
              data={trend}
            />
          </ChartCard>
          <ChartCard eyebrow="Truthful state" title="Unavailable chart">
            <LineChartView
              title="Unavailable revenue"
              summary="No points are fabricated."
              data={null}
              state="unavailable"
            />
          </ChartCard>
        </div>
      </section>

      <section aria-labelledby="table-title">
        <h2 id="table-title">Table, drawer, and export</h2>
        <TableInteractionFixture />
      </section>
    </main>
  );
}

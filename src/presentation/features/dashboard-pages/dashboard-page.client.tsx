"use client";

import { useState } from "react";

import { metricCatalog, type MetricCatalogEntry } from "@/src/domain/metrics/catalog";
import {
  AreaChartView,
  DonutChartView,
  FunnelChartView,
  HorizontalBarChartView,
  LineChartView,
  StackedBarChartView,
  VerticalBarChartView,
} from "@/src/presentation/components/dashboard/charts.client";
import {
  ChartCard,
  InsightCard,
  KpiCard,
  SourceIndicator,
} from "@/src/presentation/components/dashboard/cards";
import {
  DataTable,
  type DashboardTableColumn,
} from "@/src/presentation/components/dashboard/data-table.client";
import { DetailDrawer } from "@/src/presentation/components/dashboard/detail-drawer.client";
import type {
  DisplayState,
  KpiDisplayModel,
} from "@/src/presentation/components/dashboard/display-contracts";
import {
  ExportStatus,
  type ExportState,
} from "@/src/presentation/components/dashboard/export-status.client";
import type { DashboardPageDisplayData, DisplayTableRow } from "./display-data";
import type { DashboardPageSpec, PageChartSpec, PageTableSpec } from "./page-specs";

const catalog = new Map(metricCatalog.map((metric) => [metric.key, metric]));

function requiredMetric(key: string): MetricCatalogEntry {
  const metric = catalog.get(key);
  if (!metric) throw new Error(`F3 page references an unapproved metric: ${key}`);
  return metric;
}

function metricState(metric: MetricCatalogEntry, fixture: DashboardPageDisplayData): DisplayState {
  // Live data carries certified per-metric readiness; fixtures fall back to
  // catalog-derived inference so Phase 2 snapshots stay byte-identical.
  const liveState = fixture.states?.[metric.key];
  if (liveState) return liveState;
  if (fixture.currentValues[metric.key]) return "current";
  if (metric.status === "BUSINESS_RULE_REQUIRED") return "business_rule_required";
  if (metric.status === "SOURCE_LIMITED") return "source_limited";
  if (metric.status === "NOT_V1") return "not_configured";
  if (metric.status === "DATA_PENDING")
    return metric.key.startsWith("klaviyo.") ? "no_activity" : "data_pending";
  return "no_activity";
}

function stateReason(metric: MetricCatalogEntry, fixture: DashboardPageDisplayData): string {
  const liveReason = fixture.stateReasons?.[metric.key];
  if (liveReason) return liveReason;
  if (metric.status === "NOT_V1") return "This capability is outside the approved V1 scope.";
  if (fixture.synthetic) {
    return metric.blockingReason ?? "No validated TEST records are available for this metric.";
  }
  return metric.blockingReason ?? "No genuine activity in the selected period.";
}

function kpi(metricKey: string, fixture: DashboardPageDisplayData): KpiDisplayModel {
  const metric = requiredMetric(metricKey);
  const value = fixture.currentValues[metricKey] ?? null;
  const comparison = fixture.comparisonValues?.[metricKey];
  return {
    label: metric.label,
    value,
    state: metricState(metric, fixture),
    helpText: `${metric.sources}. ${metric.calculation}`,
    ...(!value ? { unavailableReason: stateReason(metric, fixture) } : {}),
    ...(comparison ? { comparison } : {}),
    // Sparklines are illustrative and only ever shown on synthetic fixtures.
    ...(fixture.synthetic &&
    value &&
    ["count", "quantity", "rate_basis_points"].includes(value.kind)
      ? { sparkline: [6, 8, 7, 10, 9, 12] }
      : {}),
  };
}

function chartValueFormat(
  valueKind: MetricCatalogEntry["valueKind"],
): "money" | "percent" | "count" {
  if (valueKind === "money") return "money";
  if (valueKind === "rate_basis_points") return "percent";
  return "count";
}

function Chart({
  spec,
  fixture,
}: {
  readonly spec: PageChartSpec;
  readonly fixture: DashboardPageDisplayData;
}) {
  const metric = requiredMetric(spec.metricKey);
  const state = metricState(metric, fixture);
  const data = fixture.chartData[spec.metricKey] ?? null;
  const props = {
    title: spec.title,
    summary: spec.description,
    data,
    state,
    // A declared unit from the data producer wins: some charts plot values in
    // a different unit than their headline metric (funnel counts under a
    // conversion-rate metric).
    valueFormat: fixture.chartValueFormats?.[spec.metricKey] ?? chartValueFormat(metric.valueKind),
  };
  const series = spec.secondaryMetricKey
    ? [
        { key: "value" as const, label: metric.label, tone: "forest" as const },
        {
          key: "secondaryValue" as const,
          label: requiredMetric(spec.secondaryMetricKey).label,
          tone: "gold" as const,
        },
      ]
    : undefined;
  const seriesProps = series ? { series } : {};
  const view = {
    line: <LineChartView {...props} {...seriesProps} />,
    area: <AreaChartView {...props} {...seriesProps} />,
    bar: <VerticalBarChartView {...props} {...seriesProps} />,
    horizontal: <HorizontalBarChartView {...props} {...seriesProps} />,
    stacked: <StackedBarChartView {...props} {...seriesProps} />,
    donut: <DonutChartView {...props} />,
    funnel: <FunnelChartView {...props} />,
  }[spec.kind];
  return (
    <ChartCard title={spec.title} description={spec.description} eyebrow={metric.label}>
      {view}
    </ChartCard>
  );
}

function csv(rows: readonly DisplayTableRow[]): string {
  const columns = rows.length ? Object.keys(rows[0] ?? {}) : [];
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => JSON.stringify(row[column] ?? "")).join(",")),
  ].join("\n");
}

function TableCard({
  spec,
  fixture,
}: {
  readonly spec: PageTableSpec;
  readonly fixture: DashboardPageDisplayData;
}) {
  const metric = requiredMetric(spec.metricKey);
  const state = metricState(metric, fixture);
  const rows = spec.dataset ? (fixture.rowsByDataset[spec.dataset] ?? []) : [];
  const first = rows[0];
  const columns: readonly DashboardTableColumn<DisplayTableRow>[] = first
    ? Object.keys(first).map((key) => ({
        key,
        label: key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase()),
        sortable: true,
        numeric: typeof first[key] === "number",
      }))
    : [];
  const [openRow, setOpenRow] = useState<DisplayTableRow | null>(null);
  const [exportState, setExportState] = useState<ExportState>(rows.length ? "idle" : "unsupported");
  const tableState: DisplayState = rows.length ? "current" : state;

  function exportRows() {
    if (!rows.length || !spec.dataset) return;
    setExportState("requesting");
    const blob = new Blob([csv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${spec.dataset}${fixture.synthetic ? "-synthetic-test" : ""}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExportState("success");
  }

  return (
    <ChartCard
      title={spec.title}
      description={spec.description}
      eyebrow={metric.label}
      actions={
        spec.dataset ? <ExportStatus state={exportState} onRequest={exportRows} /> : undefined
      }
    >
      <DataTable
        caption={spec.title}
        columns={columns}
        rows={rows}
        rowKey={(row) => JSON.stringify(row)}
        state={tableState}
        page={0}
        pageSize={10}
        totalRows={rows.length}
        onPageChange={() => undefined}
        {...(rows.length ? { onRowOpen: setOpenRow } : {})}
      />
      <DetailDrawer
        open={openRow !== null}
        title={`${spec.title} detail`}
        state={tableState}
        onClose={() => setOpenRow(null)}
      >
        {openRow ? (
          <dl className="detail-record">
            {Object.entries(openRow).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{String(value ?? "—")}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </DetailDrawer>
    </ChartCard>
  );
}

export function DashboardPageView({
  spec,
  fixture,
}: {
  readonly spec: DashboardPageSpec;
  readonly fixture: DashboardPageDisplayData;
}) {
  return (
    <div className={`intelligence-page intelligence-${spec.slug}`} data-page={spec.slug}>
      <section className="intelligence-kpi-grid" aria-label="Key performance indicators">
        {spec.kpis.map((metricKey) => (
          <KpiCard key={metricKey} model={kpi(metricKey, fixture)} />
        ))}
      </section>

      <section className="intelligence-chart-grid" aria-label="Analytical visualizations">
        {spec.charts.map((chart) => (
          <Chart key={`${chart.metricKey}-${chart.title}`} spec={chart} fixture={fixture} />
        ))}
      </section>

      {spec.tables.length ? (
        <section className="intelligence-table-grid" aria-label="Detailed data tables">
          {spec.tables.map((table) => (
            <TableCard key={`${table.metricKey}-${table.title}`} spec={table} fixture={fixture} />
          ))}
        </section>
      ) : null}

      <section
        className="intelligence-decision-grid"
        aria-label="Decision support and source readiness"
      >
        <InsightCard
          title={spec.decisionTitle}
          metadata={["Deterministic V1 rules", "No inferred data"]}
        >
          <p>{spec.decisionCopy}</p>
        </InsightCard>
        <div className="source-readiness-panel">
          {fixture.sources.map((source) => (
            <SourceIndicator key={source.label} model={source} />
          ))}
        </div>
      </section>
    </div>
  );
}

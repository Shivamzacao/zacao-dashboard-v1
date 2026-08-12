"use client";

import { useState } from "react";

import { metricCatalog, type MetricCatalogEntry } from "@/src/domain/metrics/catalog";
import {
  AreaChartView,
  DonutChartView,
  FunnelChartView,
  HeatmapChartView,
  HorizontalBarChartView,
  LineChartView,
  StackedBarChartView,
  VerticalBarChartView,
} from "@/src/presentation/components/dashboard/charts.client";
import {
  ChartCard,
  KpiCard,
  SourceBadge,
  WarningCard,
} from "@/src/presentation/components/dashboard/cards";
import { DataTable } from "@/src/presentation/components/dashboard/data-table.client";
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
import { metricDisplayLabel } from "./metric-copy";
import { metricSourceLabel } from "./metric-source-label";
import type { DashboardPageSpec, PageChartSpec, PageKpiSpec, PageTableSpec } from "./page-specs";
import { columnLabel, describeColumns, formatCell } from "./table-presentation";

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

function kpi(spec: PageKpiSpec, fixture: DashboardPageDisplayData): KpiDisplayModel {
  const metric = requiredMetric(spec.metricKey);
  const value = fixture.currentValues[spec.metricKey] ?? null;
  const comparison = fixture.comparisonValues?.[spec.metricKey];
  return {
    label: spec.label ?? metricDisplayLabel(metric),
    value,
    state: metricState(metric, fixture),
    sourceLabel: metricSourceLabel(metric, spec.sourceLabel),
    ...(spec.valuePresentation ? { valuePresentation: spec.valuePresentation } : {}),
    ...(spec.unitSuffix ? { unitSuffix: spec.unitSuffix } : {}),
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
): "money" | "percent" | "count" | "quantity" {
  if (valueKind === "money") return "money";
  if (valueKind === "rate_basis_points") return "percent";
  if (valueKind === "quantity") return "quantity";
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
    // No `summary`: the enclosing ChartCard header already renders
    // spec.description, and passing it here printed the sentence twice.
    data,
    state,
    // A declared unit from the data producer wins: some charts plot values in
    // a different unit than their headline metric (funnel counts under a
    // conversion-rate metric).
    valueFormat: fixture.chartValueFormats?.[spec.metricKey] ?? chartValueFormat(metric.valueKind),
  };
  const series =
    spec.series ??
    (spec.secondaryMetricKey
      ? [
          {
            key: "value" as const,
            label: metricDisplayLabel(metric),
            tone: "forest" as const,
          },
          {
            key: "secondaryValue" as const,
            label: metricDisplayLabel(requiredMetric(spec.secondaryMetricKey)),
            tone: "gold" as const,
          },
        ]
      : undefined);
  const seriesProps = series ? { series } : {};
  const view = {
    line: <LineChartView {...props} {...seriesProps} />,
    area: <AreaChartView {...props} {...seriesProps} />,
    bar: <VerticalBarChartView {...props} {...seriesProps} />,
    horizontal: <HorizontalBarChartView {...props} {...seriesProps} />,
    stacked: <StackedBarChartView {...props} {...seriesProps} />,
    donut: <DonutChartView {...props} />,
    funnel: <FunnelChartView {...props} />,
    heatmap: <HeatmapChartView {...props} />,
  }[spec.kind];
  return (
    <ChartCard
      title={spec.title}
      description={spec.description}
      eyebrow={spec.eyebrow ?? metricDisplayLabel(metric)}
      actions={<SourceBadge label={metricSourceLabel(metric, spec.sourceLabel)} />}
    >
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
  const columns = describeColumns(rows, spec.hiddenColumns);
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
      eyebrow={metricDisplayLabel(metric)}
      actions={
        <>
          <SourceBadge label={metricSourceLabel(metric, spec.sourceLabel)} />
          {spec.dataset ? <ExportStatus state={exportState} onRequest={exportRows} /> : null}
        </>
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
                <dt>{columnLabel(key)}</dt>
                <dd>{formatCell(key, value)}</dd>
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
      {fixture.alerts?.length ? (
        <section className="attention-grid" aria-label="Needs attention">
          {fixture.alerts.map((alert) => (
            <WarningCard
              key={alert.key}
              title={alert.title}
              severity={alert.severity}
              metadata={alert.metadata}
            >
              {alert.description}
            </WarningCard>
          ))}
        </section>
      ) : null}

      <section className="intelligence-kpi-grid" aria-label="Key performance indicators">
        {spec.kpis.map((kpiSpec) => (
          <KpiCard key={kpiSpec.metricKey} model={kpi(kpiSpec, fixture)} />
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

      {/* The per-source readiness pills are withheld from the page for now at
          ZACAO's request. `fixture.sources` still carries them, so restoring
          the panel is a render-only change. */}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
import { ChartCard, KpiCard } from "@/src/presentation/components/dashboard/cards";
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
import type { DashboardPageSpec, PageChartSpec, PageTableSpec } from "./page-specs";
import { columnLabel, describeColumns, formatCell } from "./table-presentation";
import { drilldownDefinition } from "@/src/application/api/catalog";
import type { DrilldownApiResponse } from "@/src/application/api/contracts";

const LIVE_PAGE_SIZE = 25;

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
    // No `summary`: the enclosing ChartCard header already renders
    // spec.description, and passing it here printed the sentence twice.
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
    heatmap: <HeatmapChartView {...props} />,
  }[spec.kind];
  return (
    <ChartCard title={spec.title} description={spec.description} eyebrow={metric.label}>
      {view}
    </ChartCard>
  );
}

function stableRowKey(row: DisplayTableRow): string {
  const preferred = ["id", "variantId", "productId", "sku", "poNumber", "lotCode", "period"];
  const identity = preferred.flatMap((key) =>
    row[key] == null ? [] : [`${key}:${String(row[key])}`],
  );
  if (identity.length > 0) return identity.join("|");
  return Object.entries(row)
    .slice(0, 4)
    .map(([key, value]) => `${key}:${String(value ?? "")}`)
    .join("|");
}

function fixtureCsv(rows: readonly DisplayTableRow[]): string {
  const columns = rows.length ? Object.keys(rows[0] ?? {}) : [];
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => JSON.stringify(row[column] ?? "")).join(",")),
  ].join("\n");
}

function TableCard({
  spec,
  fixture,
  filterQuery,
}: {
  readonly spec: PageTableSpec;
  readonly fixture: DashboardPageDisplayData;
  readonly filterQuery?: string;
}) {
  const metric = requiredMetric(spec.metricKey);
  const state = metricState(metric, fixture);
  const live = fixture.environment === "production" && !fixture.synthetic && Boolean(spec.dataset);
  const fixtureRows = spec.dataset ? (fixture.rowsByDataset[spec.dataset] ?? []) : [];
  const [rows, setRows] = useState<readonly DisplayTableRow[]>(live ? [] : fixtureRows);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
    live ? "loading" : "idle",
  );
  const [page, setPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null]);
  const [retry, setRetry] = useState(0);
  const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" } | null>(null);
  const requestSequence = useRef(0);
  const columns = useMemo(() => {
    const described = describeColumns(rows, spec.hiddenColumns);
    const allowed = spec.dataset ? new Set(drilldownDefinition(spec.dataset)?.sortFields) : null;
    return allowed
      ? described.map((column) => ({ ...column, sortable: allowed.has(column.key) }))
      : described;
  }, [rows, spec.dataset, spec.hiddenColumns]);
  const [openRow, setOpenRow] = useState<DisplayTableRow | null>(null);
  const [exportState, setExportState] = useState<ExportState>(
    spec.dataset ? "idle" : "unsupported",
  );
  const tableState: DisplayState =
    loadState === "loading"
      ? "loading"
      : loadState === "error"
        ? "error"
        : rows.length
          ? "current"
          : state;
  const cursor = cursors[page] ?? null;

  useEffect(() => {
    if (!live || !spec.dataset || !filterQuery) return;
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    const query = new URLSearchParams(filterQuery);
    query.set("limit", String(LIVE_PAGE_SIZE));
    if (sort) query.set("sort", `${sort.field}:${sort.direction}`);
    if (cursor) query.set("cursor", cursor);
    fetch(`/api/v1/drilldowns/${encodeURIComponent(spec.dataset)}?${query}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Drill-down request failed (${response.status})`);
        return (await response.json()) as DrilldownApiResponse;
      })
      .then((response) => {
        if (sequence !== requestSequence.current) return;
        setRows(response.data.rows);
        setHasNextPage(response.data.pagination.hasNextPage);
        const next = response.data.pagination.nextCursor;
        if (next) {
          setCursors((current) => {
            const copy = [...current];
            copy[page + 1] = next;
            return copy;
          });
        }
        setLoadState("idle");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || sequence !== requestSequence.current) return;
        console.error("Dashboard drill-down failed", { dataset: spec.dataset, error });
        setRows([]);
        setHasNextPage(false);
        setLoadState("error");
      });
    return () => controller.abort();
  }, [cursor, filterQuery, live, page, retry, sort, spec.dataset]);

  function exportRows() {
    if (!spec.dataset) return;
    setExportState("requesting");
    if (!live) {
      const blob = new Blob([fixtureCsv(rows)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const fixtureLink = document.createElement("a");
      fixtureLink.href = url;
      fixtureLink.download = `${spec.dataset}-synthetic-test.csv`;
      fixtureLink.click();
      URL.revokeObjectURL(url);
      setExportState("success");
      return;
    }
    if (!filterQuery) {
      setExportState("failure");
      return;
    }
    const link = document.createElement("a");
    const query = new URLSearchParams(filterQuery);
    query.set("limit", "100");
    link.href = `/api/v1/exports/${encodeURIComponent(spec.dataset)}?${query}`;
    link.click();
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
        rowKey={stableRowKey}
        state={tableState}
        page={page}
        pageSize={live ? LIVE_PAGE_SIZE : 10}
        totalRows={live ? page * LIVE_PAGE_SIZE + rows.length : rows.length}
        onPageChange={(nextPage) => {
          setLoadState("loading");
          setOpenRow(null);
          setPage(nextPage);
        }}
        rowsArePage={live}
        hasNextPage={hasNextPage}
        onSortChange={(field, direction) => {
          setLoadState("loading");
          setOpenRow(null);
          setPage(0);
          setCursors([null]);
          setSort(field === null ? null : { field, direction });
        }}
        {...(rows.length ? { onRowOpen: setOpenRow } : {})}
      />
      {loadState === "error" ? (
        <button
          type="button"
          className="table-retry"
          onClick={() => {
            setLoadState("loading");
            setRetry((value) => value + 1);
          }}
        >
          Retry loading table
        </button>
      ) : null}
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
  filterQuery,
}: {
  readonly spec: DashboardPageSpec;
  readonly fixture: DashboardPageDisplayData;
  readonly filterQuery?: string;
}) {
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 200) {
          console.warn("Dashboard long task", {
            route: spec.slug,
            durationMs: Math.round(entry.duration),
          });
        }
      }
    });
    try {
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      return;
    }
    return () => observer.disconnect();
  }, [spec.slug]);

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
            <TableCard
              key={`${table.metricKey}-${table.title}-${filterQuery ?? "fixture"}`}
              spec={table}
              fixture={fixture}
              {...(filterQuery === undefined ? {} : { filterQuery })}
            />
          ))}
        </section>
      ) : null}

      {/* The per-source readiness pills are withheld from the page for now at
          ZACAO's request. `fixture.sources` still carries them, so restoring
          the panel is a render-only change. */}
    </div>
  );
}

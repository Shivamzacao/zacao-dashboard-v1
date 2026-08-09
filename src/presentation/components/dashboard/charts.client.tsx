"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  ChartDatum,
  ChartSeriesDefinition,
  DisplayState,
  LegendItem,
} from "./display-contracts";
import { ChartLegend } from "./tooltip-legend";
import { StateSurface } from "./state-surface";

const tones = { forest: "#005d45", gold: "#c8a86b", terracotta: "#b5532f" } as const;

export type ChartValueFormat = "money" | "percent" | "count";

const tickFormatters: Record<ChartValueFormat, (value: number) => string> = {
  money: (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: Math.abs(value) >= 1000 ? "compact" : "standard",
      maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
    }).format(value),
  percent: (value) => `${value}%`,
  count: (value) => new Intl.NumberFormat("en-US").format(value),
};

const valueFormatters: Record<ChartValueFormat, (value: number) => string> = {
  money: (value) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value),
  percent: (value) =>
    `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}%`,
  count: (value) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value),
};

interface BaseChartProps {
  readonly title: string;
  readonly summary: string;
  readonly data: readonly ChartDatum[] | null;
  readonly state?: DisplayState;
  readonly height?: number;
  readonly legend?: readonly LegendItem[];
  readonly valueFormat?: ChartValueFormat;
}

interface SeriesChartProps extends BaseChartProps {
  readonly series?: readonly ChartSeriesDefinition[];
}

function ChartFrame({
  title,
  summary,
  data,
  state = "current",
  height = 260,
  legend,
  valueFormat = "count",
  // Views that already render their own accessible table (the heatmap matrix)
  // opt out of the screen-reader duplicate and size themselves.
  selfDescribing = false,
  children,
}: BaseChartProps & {
  readonly selfDescribing?: boolean;
  readonly children: React.ReactNode;
}) {
  const usableData = data?.filter((item) => item.value !== null) ?? [];
  const dataState = state === "current" && usableData.length === 0 ? "empty" : state;
  return (
    <div
      className={`chart-frame state-${dataState}`}
      style={{ "--chart-height": `${height}px` } as React.CSSProperties}
    >
      {summary ? (
        <p className="chart-summary" id={`${slug(title)}-summary`}>
          {summary}
        </p>
      ) : null}
      {legend?.length ? <ChartLegend items={legend} /> : null}
      {["current", "partial", "stale"].includes(dataState) && usableData.length ? (
        <>
          <div
            className={selfDescribing ? "chart-visual chart-visual-auto" : "chart-visual"}
            aria-hidden={selfDescribing ? undefined : true}
          >
            {children}
          </div>
          {selfDescribing ? null : (
            <AccessibleChartTable title={title} data={data ?? []} valueFormat={valueFormat} />
          )}
        </>
      ) : (
        <StateSurface state={dataState === "current" ? "empty" : dataState} />
      )}
    </div>
  );
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function AccessibleChartTable({
  title,
  data,
  valueFormat,
}: {
  readonly title: string;
  readonly data: readonly ChartDatum[];
  readonly valueFormat: ChartValueFormat;
}) {
  const format = (value: number | null | undefined) =>
    value === null || value === undefined ? "Unavailable" : valueFormatters[valueFormat](value);
  return (
    <table className="sr-only">
      <caption>{title} data</caption>
      <thead>
        <tr>
          <th scope="col">Label</th>
          <th scope="col">Value</th>
          <th scope="col">Comparison</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item) => (
          <tr key={item.key}>
            <th scope="row">{item.label}</th>
            <td>{format(item.value)}</td>
            <td>{format(item.secondaryValue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function seriesOrDefault(
  series: readonly ChartSeriesDefinition[] | undefined,
): readonly ChartSeriesDefinition[] {
  return series ?? [{ key: "value", label: "Value", tone: "forest" }];
}

const commonAxis = {
  tick: { fill: "#6c7b75", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export function LineChartView(props: SeriesChartProps) {
  const series = seriesOrDefault(props.series);
  const format = props.valueFormat ?? "count";
  return (
    <ChartFrame {...props}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          accessibilityLayer={false}
          data={props.data ?? []}
          margin={{ top: 12, right: 12, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke="#e7e9e2" vertical={false} />
          <XAxis dataKey="label" {...commonAxis} />
          <YAxis
            {...commonAxis}
            width={format === "money" ? 56 : 42}
            tickFormatter={tickFormatters[format]}
          />
          <RechartsTooltip
            contentStyle={{
              border: "1px solid #e7e9e2",
              borderRadius: 9,
              boxShadow: "0 10px 32px #12342c14",
            }}
            formatter={(value) => valueFormatters[format](Number(value))}
          />
          {series.map((item) => (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={tones[item.tone]}
              strokeWidth={2.5}
              dot={{ r: 2.5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function AreaChartView(props: SeriesChartProps) {
  const series = seriesOrDefault(props.series);
  const format = props.valueFormat ?? "count";
  return (
    <ChartFrame {...props}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          accessibilityLayer={false}
          data={props.data ?? []}
          margin={{ top: 12, right: 12, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke="#e7e9e2" vertical={false} />
          <XAxis dataKey="label" {...commonAxis} />
          <YAxis
            {...commonAxis}
            width={format === "money" ? 56 : 42}
            tickFormatter={tickFormatters[format]}
          />
          <RechartsTooltip formatter={(value) => valueFormatters[format](Number(value))} />
          {series.map((item) => (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={tones[item.tone]}
              fill={`${tones[item.tone]}22`}
              strokeWidth={2.2}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function BarChartView(
  props: SeriesChartProps & { readonly horizontal?: boolean; readonly stacked?: boolean },
) {
  const series = seriesOrDefault(props.series);
  const format = props.valueFormat ?? "count";
  const xAxis = props.horizontal ? (
    <XAxis {...commonAxis} type="number" tickFormatter={tickFormatters[format]} />
  ) : (
    <XAxis {...commonAxis} type="category" dataKey="label" />
  );
  const yAxis = props.horizontal ? (
    <YAxis {...commonAxis} width={74} type="category" dataKey="label" />
  ) : (
    <YAxis
      {...commonAxis}
      width={format === "money" ? 56 : 42}
      type="number"
      tickFormatter={tickFormatters[format]}
    />
  );
  return (
    <ChartFrame {...props}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer={false}
          data={props.data ?? []}
          layout={props.horizontal ? "vertical" : "horizontal"}
          margin={{ top: 12, right: 12, bottom: 8, left: props.horizontal ? 28 : 0 }}
        >
          <CartesianGrid
            stroke="#e7e9e2"
            vertical={!props.horizontal}
            horizontal={Boolean(props.horizontal)}
          />
          {xAxis}
          {yAxis}
          <RechartsTooltip formatter={(value) => valueFormatters[format](Number(value))} />
          {series.map((item) =>
            props.stacked ? (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                fill={tones[item.tone]}
                radius={[4, 4, 0, 0]}
                stackId="stack"
                isAnimationActive={false}
              />
            ) : (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                fill={tones[item.tone]}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            ),
          )}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function VerticalBarChartView(props: SeriesChartProps) {
  return <BarChartView {...props} />;
}
export function HorizontalBarChartView(props: SeriesChartProps) {
  return <BarChartView {...props} horizontal />;
}
export function StackedBarChartView(props: SeriesChartProps) {
  return <BarChartView {...props} stacked />;
}

export function DonutChartView(props: BaseChartProps) {
  const palette = [tones.forest, tones.gold, tones.terracotta, "#6c7b75"];
  const format = props.valueFormat ?? "count";
  return (
    <ChartFrame {...props}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart accessibilityLayer={false}>
          <Pie
            data={props.data ?? []}
            dataKey="value"
            nameKey="label"
            rootTabIndex={-1}
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            isAnimationActive={false}
          >
            {(props.data ?? []).map((item, index) => (
              <Cell key={item.key} fill={palette[index % palette.length] ?? tones.forest} />
            ))}
          </Pie>
          <RechartsTooltip formatter={(value) => valueFormatters[format](Number(value))} />
        </PieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function FunnelChartView(props: BaseChartProps) {
  const format = props.valueFormat ?? "count";
  return (
    <ChartFrame {...props}>
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart accessibilityLayer={false}>
          <RechartsTooltip formatter={(value) => valueFormatters[format](Number(value))} />
          <Funnel dataKey="value" data={props.data ?? []} isAnimationActive={false}>
            <LabelList position="right" fill="#1b2925" stroke="none" dataKey="label" />
            {(props.data ?? []).map((item, index) => (
              <Cell
                key={item.key}
                fill={
                  [tones.forest, "#15835f", tones.gold, tones.terracotta][index % 4] ?? tones.forest
                }
              />
            ))}
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Distinct values in first-seen order, which for matrix data is reporting order. */
function distinct(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

/** `9 AM` -> `9a`, so a 24-column hour ruler stays legible in a card. */
function compactColumnLabel(label: string): string {
  const match = /^(\d{1,2})\s*(AM|PM)$/i.exec(label.trim());
  return match ? `${match[1]}${match[2]?.[0]?.toLowerCase() ?? ""}` : label;
}

function heatIntensity(value: number, max: number): number {
  if (value <= 0) return 0;
  return 0.18 + 0.82 * Math.sqrt(value / max);
}

/**
 * Matrix heatmap: rows are the datum `group`, columns the datum `label`. It is
 * a real table rather than a decorative grid, so the cell values are the
 * accessible representation instead of a duplicated screen-reader table.
 */
function HeatmapMatrix({
  title,
  data,
  format,
}: {
  readonly title: string;
  readonly data: readonly ChartDatum[];
  readonly format: ChartValueFormat;
}) {
  const rows = distinct(data.map((item) => item.group ?? ""));
  const columns = distinct(data.map((item) => item.label));
  const cells = new Map(data.map((item) => [`${item.group ?? ""} ${item.label}`, item]));
  const max = Math.max(...data.map((item) => Math.abs(item.value ?? 0)), 1);

  return (
    <div className="heatmap-matrix-scroll">
      <table className="heatmap-matrix">
        <caption className="sr-only">{title} data</caption>
        <thead>
          <tr>
            <td className="heatmap-corner" />
            {columns.map((column, index) => (
              <th key={column} scope="col">
                <span className="sr-only">{column}</span>
                <span className="heatmap-column-tick" aria-hidden="true">
                  {index % 3 === 0 ? compactColumnLabel(column) : ""}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <th scope="row">{row}</th>
              {columns.map((column) => {
                const cell = cells.get(`${row} ${column}`);
                const value = cell?.value ?? null;
                return (
                  <td
                    key={column}
                    className="heatmap-cell"
                    data-unreported={value === null ? "" : undefined}
                    title={`${row} ${column}: ${value === null ? "not reported" : valueFormatters[format](value)}`}
                    style={
                      {
                        "--heat": String(value === null ? 0 : heatIntensity(Math.abs(value), max)),
                      } as React.CSSProperties
                    }
                  >
                    <span className="sr-only">
                      {value === null ? "Not reported" : valueFormatters[format](value)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="heatmap-scale" aria-hidden="true">
        <span>Fewer</span>
        <span className="heatmap-scale-ramp" />
        <span>{`More (peak ${valueFormatters[format](max)})`}</span>
      </p>
    </div>
  );
}

export function HeatmapChartView(props: BaseChartProps) {
  const data = props.data ?? [];
  const format = props.valueFormat ?? "count";
  if (data.some((item) => item.group)) {
    return (
      <ChartFrame {...props} selfDescribing>
        <HeatmapMatrix title={props.title} data={data} format={format} />
      </ChartFrame>
    );
  }
  const max = Math.max(...data.map((item) => Math.abs(item.value ?? 0)), 1);
  return (
    <ChartFrame {...props}>
      <div className="heatmap-grid">
        {data.map((item) => (
          <div
            key={item.key}
            className="heatmap-cell-labelled"
            style={
              {
                "--heat-opacity": String(0.12 + (Math.abs(item.value ?? 0) / max) * 0.1),
              } as React.CSSProperties
            }
          >
            <span>{item.label}</span>
            <strong>{item.value === null ? "—" : valueFormatters[format](item.value)}</strong>
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}

export function SparklineChartView({ title, summary, data, state = "current" }: BaseChartProps) {
  return (
    <ChartFrame title={title} summary={summary} data={data} state={state} height={58}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart accessibilityLayer={false} data={data ?? []}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={tones.forest}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

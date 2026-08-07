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

interface BaseChartProps {
  readonly title: string;
  readonly summary: string;
  readonly data: readonly ChartDatum[] | null;
  readonly state?: DisplayState;
  readonly height?: number;
  readonly legend?: readonly LegendItem[];
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
  children,
}: BaseChartProps & { readonly children: React.ReactNode }) {
  const usableData = data?.filter((item) => item.value !== null) ?? [];
  const dataState = state === "current" && usableData.length === 0 ? "empty" : state;
  return (
    <div
      className={`chart-frame state-${dataState}`}
      style={{ "--chart-height": `${height}px` } as React.CSSProperties}
    >
      <p className="chart-summary" id={`${slug(title)}-summary`}>
        {summary}
      </p>
      {legend?.length ? <ChartLegend items={legend} /> : null}
      {["current", "partial", "stale"].includes(dataState) && usableData.length ? (
        <>
          <div className="chart-visual" aria-hidden="true">
            {children}
          </div>
          <AccessibleChartTable title={title} data={data ?? []} />
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
}: {
  readonly title: string;
  readonly data: readonly ChartDatum[];
}) {
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
            <td>{item.value ?? "Unavailable"}</td>
            <td>{item.secondaryValue ?? "Unavailable"}</td>
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
          <YAxis {...commonAxis} width={42} />
          <RechartsTooltip
            contentStyle={{
              border: "1px solid #e7e9e2",
              borderRadius: 9,
              boxShadow: "0 10px 32px #12342c14",
            }}
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
          <YAxis {...commonAxis} width={42} />
          <RechartsTooltip />
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
  const xAxis = props.horizontal ? (
    <XAxis {...commonAxis} type="number" />
  ) : (
    <XAxis {...commonAxis} type="category" dataKey="label" />
  );
  const yAxis = props.horizontal ? (
    <YAxis {...commonAxis} width={74} type="category" dataKey="label" />
  ) : (
    <YAxis {...commonAxis} width={42} type="number" />
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
          <RechartsTooltip />
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
          <RechartsTooltip />
        </PieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function FunnelChartView(props: BaseChartProps) {
  return (
    <ChartFrame {...props}>
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart accessibilityLayer={false}>
          <RechartsTooltip />
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

export function HeatmapChartView(props: BaseChartProps) {
  const max = Math.max(...(props.data ?? []).map((item) => Math.abs(item.value ?? 0)), 1);
  return (
    <ChartFrame {...props}>
      <div className="heatmap-grid">
        {(props.data ?? []).map((item) => (
          <div
            key={item.key}
            className="heatmap-cell"
            style={
              {
                "--heat-opacity": String(0.12 + (Math.abs(item.value ?? 0) / max) * 0.1),
              } as React.CSSProperties
            }
          >
            <span>{item.label}</span>
            <strong>{item.value ?? "—"}</strong>
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

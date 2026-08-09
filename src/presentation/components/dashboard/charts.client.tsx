"use client";

import { Fragment } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  /**
   * Optional in-frame description. Omit it when the surrounding card already
   * carries the same copy, or the page renders the sentence twice.
   */
  readonly summary?: string;
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
  children,
}: BaseChartProps & { readonly children: React.ReactNode }) {
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
          <div className="chart-visual" aria-hidden="true">
            {children}
          </div>
          <AccessibleChartTable title={title} data={data ?? []} valueFormat={valueFormat} />
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
            {/* Grouped data (e.g. day/hour heatmap cells) shortens `label` to
                just the column value for the visual grid; restore the group
                here so the row stays self-describing without it. */}
            <th scope="row">{item.group ? `${item.group} ${item.label}` : item.label}</th>
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
/** Rows that fit the default frame without crushing the type. */
const RANKED_ROW_LIMIT = 8;

/**
 * Ranked rows rather than a category axis. A long-tail breakdown (24 billing
 * regions in a 260px frame) leaves Recharts ~10px per band, so it wraps long
 * category names onto colliding lines and thins the ticks — which silently
 * prints a label next to a bar it does not belong to. Rows bind each label to
 * its own value, and the tail is summarised rather than dropped in silence.
 */
export function HorizontalBarChartView(props: SeriesChartProps) {
  const format = props.valueFormat ?? "count";
  const ranked = [...(props.data ?? [])]
    .filter((item) => item.value !== null)
    .sort((left, right) => (right.value ?? 0) - (left.value ?? 0));
  const shown = ranked.slice(0, RANKED_ROW_LIMIT);
  const rest = ranked.slice(RANKED_ROW_LIMIT);
  const peak = Math.max(...shown.map((item) => Math.abs(item.value ?? 0)), 1);
  const restTotal = rest.reduce((sum, item) => sum + (item.value ?? 0), 0);
  return (
    <ChartFrame {...props}>
      <ol className="ranked-bars">
        {shown.map((item) => (
          <li key={item.key} className="ranked-bar">
            <span className="ranked-bar-label" title={item.label}>
              {item.label}
            </span>
            <span className="ranked-bar-track">
              <span
                className="ranked-bar-fill"
                style={{ width: `${Math.max((Math.abs(item.value ?? 0) / peak) * 100, 1)}%` }}
              />
            </span>
            <span className="ranked-bar-value">{valueFormatters[format](item.value ?? 0)}</span>
          </li>
        ))}
        {rest.length > 0 ? (
          <li className="ranked-bar ranked-bar-rest">
            <span className="ranked-bar-label">{`${rest.length} more`}</span>
            <span className="ranked-bar-track" />
            <span className="ranked-bar-value">{valueFormatters[format](restTotal)}</span>
          </li>
        ) : null}
      </ol>
    </ChartFrame>
  );
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

/**
 * One hue per stage rather than a ramp of near-identical greens: the bands sit
 * edge to edge, so neighbours have to be told apart at a glance. Every colour
 * clears 4.5:1 against the white value printed on it.
 */
const funnelPalette = [
  "#005d45",
  "#0f7f6c",
  "#2f6f9f",
  "#7a5aa8",
  "#8f6a15",
  "#b5532f",
  "#5d6b65",
] as const;

function stageColour(index: number): string {
  return funnelPalette[index % funnelPalette.length] ?? funnelPalette[0];
}

function stageShare(value: number, reference: number): number {
  return reference > 0 ? value / reference : 0;
}

/** Width the closing edge tapers to, as a share of the entry band. */
const FUNNEL_TIP_SHARE = 0.14;

/**
 * How much of each edge width comes from the data rather than from a fixed
 * cone. A purely proportional funnel collapses once the stages span two orders
 * of magnitude (1,280 sessions to 18 orders): every closing stage lands on the
 * same sub-pixel floor, and the bands draw as straight vertical sides instead
 * of a taper. Blending with a cone keeps each band strictly narrower than the
 * one above it, so the silhouette always reads as a funnel; the exact counts
 * and the step-over-step conversion sit on every band.
 */
const FUNNEL_DATA_WEIGHT = 0.45;

/**
 * Edge widths, as shares of the frame, from the entry band's top edge down to
 * the tip — one more entry than there are stages, since band `i` spans edges
 * `i` and `i + 1`.
 */
function funnelEdges(stages: readonly ChartDatum[]): readonly number[] {
  const entry = stages[0]?.value ?? 0;
  let ceiling = 1;
  const shares = stages.map((item) => {
    // Clamp non-monotone data: no stage may draw wider than the one above it.
    ceiling = Math.min(ceiling, stageShare(Math.abs(item.value ?? 0), entry));
    return ceiling;
  });
  const closing = (shares[shares.length - 1] ?? 0) / 2;
  return [...shares, closing].map((share, index) => {
    const cone = 1 - (index / stages.length) * (1 - FUNNEL_TIP_SHARE);
    return FUNNEL_DATA_WEIGHT * share + (1 - FUNNEL_DATA_WEIGHT) * cone;
  });
}

/**
 * Whether a band is wide enough to carry its own value. Narrow closing bands
 * print the count beside the shape instead, where it cannot be clipped.
 */
function bandFitsValue(midWidth: number, text: string): boolean {
  return midWidth >= text.length * 3.4 + 10;
}

/**
 * The count for a band too narrow to carry it, printed just past the taper.
 * `edge` is the band's widest side, so the box clears the shape at every
 * height rather than only where the two meet. The start is capped and the box
 * bounded by the space beside it, so a long money value is ellipsised inside
 * the frame instead of escaping it.
 */
function FunnelOutsideValue({ edge, text }: { readonly edge: number; readonly text: string }) {
  const start = Math.min(edge, 60);
  return (
    <span
      className="funnel-band-value funnel-band-value-outside"
      style={{ left: `${start}%`, maxWidth: `calc(${100 - start}% - 8px)` }}
      title={text}
    >
      {text}
    </span>
  );
}

/**
 * A tapering funnel: one trapezoid band per stage, each in its own colour,
 * narrowing to a tip. The stage name and its step-over-step conversion sit
 * beside the band and the count rides on it, so the shape shows where the
 * drop-off happens while the text carries the numbers the widths cannot.
 */
export function FunnelChartView(props: BaseChartProps) {
  const format = props.valueFormat ?? "count";
  const stages = (props.data ?? []).filter((item) => item.value !== null);
  const edges = funnelEdges(stages);
  return (
    <ChartFrame {...props}>
      <ol className="funnel-chart">
        {stages.map((item, index) => {
          const value = item.value ?? 0;
          const previous = index > 0 ? (stages[index - 1]?.value ?? 0) : null;
          const step = previous === null ? null : stageShare(value, previous);
          const top = (edges[index] ?? 1) * 100;
          const bottom = (edges[index + 1] ?? top) * 100;
          const colour = stageColour(index);
          const text = valueFormatters[format](value);
          const inside = bandFitsValue((top + bottom) / 2, text);
          return (
            <li key={item.key} className="funnel-row">
              <span className="funnel-row-head">
                <span className="funnel-row-label" title={item.label}>
                  {item.label}
                </span>
                <span className="funnel-row-step">
                  {step === null ? "entry" : `${(step * 100).toFixed(1)}% of previous`}
                </span>
              </span>
              <span className="funnel-row-band">
                <span
                  className="funnel-band-shape"
                  style={{
                    background: colour,
                    clipPath: `polygon(${50 - top / 2}% 0%, ${50 + top / 2}% 0%, ${50 + bottom / 2}% 100%, ${50 - bottom / 2}% 100%)`,
                  }}
                  aria-hidden="true"
                />
                {inside ? (
                  <span className="funnel-band-value">{text}</span>
                ) : (
                  <FunnelOutsideValue edge={50 + Math.max(top, bottom) / 2} text={text} />
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </ChartFrame>
  );
}

export function HeatmapChartView(props: BaseChartProps) {
  const data = props.data ?? [];
  const format = props.valueFormat ?? "count";
  // Day/hour breakdowns arrive with every item tagged by a `group` (the day);
  // that's the signal to lay cells out as a grid instead of a flat list — a
  // flat list of ~168 labelled cells is exactly the unreadable-axis problem
  // this component exists to avoid.
  if (data.length > 0 && data.every((item) => item.group !== undefined)) {
    return <GridHeatmapChartView {...props} data={data} format={format} />;
  }
  const max = Math.max(...data.map((item) => Math.abs(item.value ?? 0)), 1);
  return (
    <ChartFrame {...props}>
      <div className="heatmap-grid">
        {data.map((item) => (
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
            <strong>{item.value === null ? "—" : valueFormatters[format](item.value)}</strong>
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}

/** Canonical week order for grouping rows; anything unrecognised sorts after by name. */
const WEEKDAY_ORDER = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function weekdayRank(day: string): number {
  const index = WEEKDAY_ORDER.indexOf(day as (typeof WEEKDAY_ORDER)[number]);
  return index === -1 ? WEEKDAY_ORDER.length : index;
}

function GridHeatmapChartView(
  props: BaseChartProps & { readonly data: readonly ChartDatum[]; readonly format: ChartValueFormat },
) {
  const { data, format } = props;
  const rows = [...new Set(data.map((item) => item.group ?? ""))].sort(
    (left, right) => weekdayRank(left) - weekdayRank(right) || left.localeCompare(right),
  );
  const columns = [...new Set(data.map((item) => item.label))].sort(
    (left, right) => Number(left) - Number(right),
  );
  const byCell = new Map(data.map((item) => [`${item.group ?? ""}|${item.label}`, item]));
  const max = Math.max(...data.map((item) => Math.abs(item.value ?? 0)), 1);
  return (
    <ChartFrame {...props}>
      <div
        className="heatmap-grid-2d"
        style={{ "--heatmap-columns": String(columns.length) } as React.CSSProperties}
      >
        <span className="heatmap-corner" aria-hidden="true" />
        {columns.map((hour) => (
          <span key={`col-${hour}`} className="heatmap-col-label">
            {Number(hour) % 3 === 0 ? hour : ""}
          </span>
        ))}
        {rows.map((row) => (
          <Fragment key={`row-${row}`}>
            <span className="heatmap-row-label">{row.slice(0, 3)}</span>
            {columns.map((hour) => {
              const cell = byCell.get(`${row}|${hour}`);
              const value = cell?.value ?? 0;
              return (
                <span
                  key={`${row}-${hour}`}
                  className="heatmap-cell-2d"
                  title={`${row} ${hour}:00 — ${cell ? valueFormatters[format](value) : valueFormatters[format](0)}`}
                  style={
                    {
                      "--heat-opacity": String(cell ? 0.08 + (Math.abs(value) / max) * 0.85 : 0.04),
                    } as React.CSSProperties
                  }
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </ChartFrame>
  );
}

export function SparklineChartView({ title, summary, data, state = "current" }: BaseChartProps) {
  return (
    <ChartFrame
      title={title}
      {...(summary === undefined ? {} : { summary })}
      data={data}
      state={state}
      height={58}
    >
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

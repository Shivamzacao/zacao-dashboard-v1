import { z } from "zod";

import {
  dateRangeSchema,
  readinessSchema,
  sourceStatusSchema,
  usdMoneySchema,
} from "@/src/domain/contracts";
import {
  dashboardSectionSchema,
  metricImplementationStatusSchema,
} from "@/src/domain/metrics/catalog";

const countValueSchema = z.object({ kind: z.literal("count"), value: z.number().safe() }).strict();
const quantityValueSchema = z
  .object({ kind: z.literal("quantity"), value: z.number().finite() })
  .strict();
const moneyValueSchema = z.object({ kind: z.literal("money"), value: usdMoneySchema }).strict();
const rateValueSchema = z
  .object({ kind: z.literal("rate_basis_points"), value: z.number().int().safe() })
  .strict();
const durationValueSchema = z
  .object({ kind: z.literal("duration_seconds"), value: z.number().int().safe() })
  .strict();
const dateValueSchema = z.object({ kind: z.literal("date"), value: z.string().date() }).strict();
const statusValueSchema = z
  .object({ kind: z.literal("status"), value: z.string().trim().min(1).max(200) })
  .strict();

export const metricDisplayValueSchema = z.discriminatedUnion("kind", [
  countValueSchema,
  quantityValueSchema,
  moneyValueSchema,
  rateValueSchema,
  durationValueSchema,
  dateValueSchema,
  statusValueSchema,
]);

export type MetricDisplayValue = z.infer<typeof metricDisplayValueSchema>;

export const metricComparisonSchema = z
  .object({
    mode: z.enum(["previous_period", "previous_year"]),
    dataPeriod: dateRangeSchema,
    value: metricDisplayValueSchema.nullable(),
  })
  .strict();

export type MetricComparison = z.infer<typeof metricComparisonSchema>;

export const metricViewModelSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    definitionVersion: z.literal("1.0"),
    implementationStatus: metricImplementationStatusSchema,
    value: metricDisplayValueSchema.nullable(),
    readiness: readinessSchema,
    dataPeriod: dateRangeSchema,
    sources: z.array(sourceStatusSchema),
    warnings: z.array(z.string().trim().min(1).max(120)),
    unavailableReason: z.string().trim().min(1).max(500).nullable(),
    /** Present only when the request asked for a comparison period. */
    comparison: metricComparisonSchema.optional(),
  })
  .strict();

export type MetricViewModel = z.infer<typeof metricViewModelSchema>;

export const metricSeriesPointSchema = z
  .object({
    period: z.string().min(1),
    value: metricDisplayValueSchema.nullable(),
  })
  .strict();

export const metricSeriesViewModelSchema = z
  .object({
    metric: metricViewModelSchema,
    grain: z.enum(["hour", "day", "week", "month"]),
    points: z.array(metricSeriesPointSchema),
  })
  .strict();

export type MetricSeriesViewModel = z.infer<typeof metricSeriesViewModelSchema>;

export const metricBreakdownItemSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    // Second dimension for breakdowns that form a matrix (weekday x hour); the
    // item then reads as one cell of `group` by `label`.
    group: z.string().min(1).optional(),
    values: z.array(metricDisplayValueSchema),
    warnings: z.array(z.string().min(1)),
  })
  .strict();

export const metricBreakdownViewModelSchema = z
  .object({
    metric: metricViewModelSchema,
    dimension: z.string().min(1),
    items: z.array(metricBreakdownItemSchema),
  })
  .strict();

export type MetricBreakdownViewModel = z.infer<typeof metricBreakdownViewModelSchema>;

const safeTableCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const metricTableViewModelSchema = z
  .object({
    metric: metricViewModelSchema,
    columns: z.array(z.string().min(1)),
    rows: z.array(z.record(z.string(), safeTableCellSchema)),
  })
  .strict();

export type MetricTableViewModel = z.infer<typeof metricTableViewModelSchema>;

export const dashboardPageViewModelSchema = z
  .object({
    section: dashboardSectionSchema,
    dataPeriod: dateRangeSchema,
    metrics: z.array(metricViewModelSchema),
    series: z.array(metricSeriesViewModelSchema),
    breakdowns: z.array(metricBreakdownViewModelSchema),
    tables: z.array(metricTableViewModelSchema),
    sources: z.array(sourceStatusSchema),
    warnings: z.array(z.string().min(1)),
  })
  .strict();

export type DashboardPageViewModel = z.infer<typeof dashboardPageViewModelSchema>;

import type { DateRange } from "@/src/domain/contracts/date-range";
import { dateRangeSchema } from "@/src/domain/contracts/date-range";
import { reportingDayBounds } from "@/src/domain/utilities/time";

export const KLAVIYO_REPORT_STATISTICS = [
  "recipients",
  "delivered",
  "delivery_rate",
  "opens_unique",
  "open_rate",
  "clicks_unique",
  "click_rate",
  "click_to_open_rate",
  "bounced",
  "bounce_rate",
  "spam_complaints",
  "spam_complaint_rate",
  "conversions",
  "conversion_rate",
  "conversion_value",
  "average_order_value",
  "revenue_per_recipient",
] as const;

export type KlaviyoInterval = "hour" | "day" | "week" | "month";

function timeframe(dateRange: DateRange, timeZone: "America/New_York") {
  const valid = dateRangeSchema.parse(dateRange);
  const start = reportingDayBounds(valid.startDate, timeZone).start;
  const endExclusive = reportingDayBounds(valid.endDate, timeZone).endExclusive;
  if (endExclusive.getTime() - start.getTime() > 367 * 24 * 60 * 60 * 1_000) {
    throw new Error("Klaviyo metric/report requests cannot exceed one year");
  }
  return { start: start.toISOString(), end: endExclusive.toISOString() };
}

export function buildCampaignReportRequest(input: {
  dateRange: DateRange;
  timeZone: "America/New_York";
  conversionMetricId: string;
}) {
  return {
    data: {
      type: "campaign-values-report",
      attributes: {
        timeframe: timeframe(input.dateRange, input.timeZone),
        conversion_metric_id: input.conversionMetricId,
        statistics: KLAVIYO_REPORT_STATISTICS,
      },
    },
  } as const;
}

export function buildFlowReportRequest(input: {
  dateRange: DateRange;
  timeZone: "America/New_York";
  conversionMetricId: string;
}) {
  return {
    data: {
      type: "flow-values-report",
      attributes: {
        timeframe: timeframe(input.dateRange, input.timeZone),
        conversion_metric_id: input.conversionMetricId,
        statistics: KLAVIYO_REPORT_STATISTICS,
      },
    },
  } as const;
}

export function buildMetricAggregateRequest(input: {
  dateRange: DateRange;
  timeZone: "America/New_York";
  metricId: string;
  interval: KlaviyoInterval;
}) {
  const range = timeframe(input.dateRange, input.timeZone);
  return {
    data: {
      type: "metric-aggregate",
      attributes: {
        metric_id: input.metricId,
        measurements: ["count", "unique", "sum_value"],
        interval: input.interval,
        filter: [`greater-or-equal(datetime,${range.start})`, `less-than(datetime,${range.end})`],
        timezone: input.timeZone,
      },
    },
  } as const;
}

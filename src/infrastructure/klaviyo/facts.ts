import type {
  KlaviyoPerformanceFact,
  KlaviyoPerformanceRow,
  KlaviyoEngagementPoint,
  KlaviyoSmsFact,
  KlaviyoTrendPoint,
} from "@/src/application/metrics/types";

import type { normalizeKlaviyoAggregate, normalizeKlaviyoReportRows } from "./normalization";

type ReportRow = ReturnType<typeof normalizeKlaviyoReportRows>[number];
type AggregateSeries = ReturnType<typeof normalizeKlaviyoAggregate>;

function statistic(row: ReportRow, key: string): number | null {
  const value = row.statistics[key];
  return value === undefined ? null : value;
}

/**
 * Klaviyo reports return JSON numbers: counts as integers, rates as 0..1
 * fractions, and conversion value as decimal dollars. The provider values are
 * already floats, so scaling rounds once at the target precision.
 */
function numberToScaledInteger(value: number | null, scale: number): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new Error("Klaviyo statistic is not a finite number");
  const rounded = Math.round(value * 10 ** scale);
  if (!Number.isSafeInteger(rounded)) {
    throw new Error("Klaviyo statistic exceeds the safe integer range");
  }
  return rounded;
}

const toBasisPoints = (value: number | null) => numberToScaledInteger(value, 4);
const toMinorUnits = (value: number | null) => numberToScaledInteger(value, 2);
const toCount = (value: number | null) => numberToScaledInteger(value, 0);

function mapPerformanceFact(row: ReportRow): KlaviyoPerformanceFact {
  return {
    recipients: toCount(statistic(row, "recipients")),
    delivered: toCount(statistic(row, "delivered")),
    deliveryRateBasisPoints: toBasisPoints(statistic(row, "delivery_rate")),
    opensUnique: toCount(statistic(row, "opens_unique")),
    openRateBasisPoints: toBasisPoints(statistic(row, "open_rate")),
    clicksUnique: toCount(statistic(row, "clicks_unique")),
    clickRateBasisPoints: toBasisPoints(statistic(row, "click_rate")),
    clickToOpenRateBasisPoints: toBasisPoints(statistic(row, "click_to_open_rate")),
    bounced: toCount(statistic(row, "bounced")),
    bounceRateBasisPoints: toBasisPoints(statistic(row, "bounce_rate")),
    unsubscribesUnique: toCount(statistic(row, "unsubscribe_uniques")),
    unsubscribeRateBasisPoints: toBasisPoints(statistic(row, "unsubscribe_rate")),
    spamComplaints: toCount(statistic(row, "spam_complaints")),
    spamComplaintRateBasisPoints: toBasisPoints(statistic(row, "spam_complaint_rate")),
    conversions: toCount(statistic(row, "conversions")),
    conversionValueMinorUnits: toMinorUnits(statistic(row, "conversion_value")),
    revenuePerRecipientMinorUnits: toMinorUnits(statistic(row, "revenue_per_recipient")),
  };
}

export function mapKlaviyoPerformanceRows(input: {
  rows: readonly ReportRow[];
  groupingIdKey: "campaign_id" | "flow_id";
  namesById: ReadonlyMap<string, string>;
}): readonly KlaviyoPerformanceRow[] {
  return input.rows.map((row) => {
    const rawId = row.groupings[input.groupingIdKey];
    const id = typeof rawId === "string" ? rawId : String(rawId ?? "unknown");
    const channel = row.groupings["send_channel"] === "sms" ? ("sms" as const) : ("email" as const);
    return {
      id,
      name: input.namesById.get(id) ?? id,
      channel,
      ...mapPerformanceFact(row),
    };
  });
}

/** Aggregate email performance across report rows for the overview cards. */
export function mapKlaviyoEmailOverviewFact(
  rows: readonly ReportRow[],
): KlaviyoPerformanceFact | null {
  const emailRows = rows.filter((row) => row.groupings["send_channel"] !== "sms");
  if (emailRows.length === 0) return null;

  const sumCounts = (key: string) => {
    const values = emailRows
      .map((row) => toCount(statistic(row, key)))
      .filter((value): value is number => value !== null);
    return values.length === 0 ? null : values.reduce((total, value) => total + value, 0);
  };
  const sumMinorUnits = (key: string) => {
    const values = emailRows
      .map((row) => toMinorUnits(statistic(row, key)))
      .filter((value): value is number => value !== null);
    return values.length === 0 ? null : values.reduce((total, value) => total + value, 0);
  };
  const ratioBasisPoints = (numerator: number | null, denominator: number | null) =>
    numerator === null || denominator === null || denominator === 0
      ? null
      : Math.round((numerator * 10_000) / denominator);

  const recipients = sumCounts("recipients");
  const delivered = sumCounts("delivered");
  const opens = sumCounts("opens_unique");
  const clicks = sumCounts("clicks_unique");
  const bounced = sumCounts("bounced");
  const unsubscribes = sumCounts("unsubscribe_uniques");
  const spamComplaints = sumCounts("spam_complaints");
  const conversionValue = sumMinorUnits("conversion_value");

  return {
    recipients,
    delivered,
    deliveryRateBasisPoints: ratioBasisPoints(delivered, recipients),
    opensUnique: opens,
    openRateBasisPoints: ratioBasisPoints(opens, delivered),
    clicksUnique: clicks,
    clickRateBasisPoints: ratioBasisPoints(clicks, delivered),
    clickToOpenRateBasisPoints: ratioBasisPoints(clicks, opens),
    bounced,
    bounceRateBasisPoints: ratioBasisPoints(bounced, recipients),
    unsubscribesUnique: unsubscribes,
    unsubscribeRateBasisPoints: ratioBasisPoints(unsubscribes, delivered),
    spamComplaints,
    spamComplaintRateBasisPoints: ratioBasisPoints(spamComplaints, delivered),
    conversions: sumCounts("conversions"),
    conversionValueMinorUnits: conversionValue,
    revenuePerRecipientMinorUnits:
      conversionValue === null || recipients === null || recipients === 0
        ? null
        : Math.round(conversionValue / recipients),
  };
}

export function mapKlaviyoSmsFact(rows: readonly ReportRow[]): KlaviyoSmsFact | null {
  const smsRows = rows.filter((row) => row.groupings["send_channel"] === "sms");
  if (smsRows.length === 0) return null;
  const sum = (key: string) => {
    const values = smsRows
      .map((row) => toCount(statistic(row, key)))
      .filter((value): value is number => value !== null);
    return values.length === 0 ? null : values.reduce((total, value) => total + value, 0);
  };
  return {
    sent: sum("recipients"),
    deliveredOrReceived: sum("delivered"),
    clicked: sum("clicks_unique"),
    failed: sum("bounced"),
    unsubscribed: sum("unsubscribe_uniques"),
    measurementLabel: "report_send_date",
  };
}

export function mapKlaviyoTrendPoints(
  series: AggregateSeries,
  measurement: "count" | "unique" | "sum_value" = "count",
): readonly KlaviyoTrendPoint[] {
  const points = new Map<string, number | null>();
  for (const entry of series) {
    const measurements = entry.measurements[measurement] ?? [];
    entry.dates.forEach((date, index) => {
      const value = measurements[index] ?? null;
      const existing = points.get(date);
      const counted = value === null ? null : toCount(value);
      points.set(date, counted === null ? (existing ?? null) : (existing ?? 0) + counted);
    });
  }
  return [...points.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, count]) => ({ period, count }));
}

/** Preserve the two audited Klaviyo event series instead of summing unlike events. */
export function mergeKlaviyoEngagementPoints(
  opens: readonly KlaviyoTrendPoint[],
  clicks: readonly KlaviyoTrendPoint[],
): readonly KlaviyoEngagementPoint[] {
  const periods = new Map<string, { opens: number | null; clicks: number | null }>();
  for (const point of opens) {
    periods.set(point.period, {
      opens: point.count,
      clicks: periods.get(point.period)?.clicks ?? null,
    });
  }
  for (const point of clicks) {
    periods.set(point.period, {
      opens: periods.get(point.period)?.opens ?? null,
      clicks: point.count,
    });
  }
  return [...periods]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, values]) => ({ period, ...values }));
}

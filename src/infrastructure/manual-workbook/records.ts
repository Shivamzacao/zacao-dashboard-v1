import type { ManualMetricRecord } from "@/src/application/metrics/types";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";

function text(record: SheetRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function numeric(record: SheetRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const PERIOD = /^(\d{4})-(\d{2})$/;

function periodBounds(period: string | null): { start: string; end: string } | null {
  const match = period ? PERIOD.exec(period) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${match[1]}-${match[2]}-01`,
    end: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Projections from the workbook's snake_case rows onto the Title-Case record
 * shapes the certified manual metric builders consume (ADR-003 mapping rules).
 * Builders in src/application/metrics/manual.ts stay untouched.
 */

export function toMarketingSpendRecords(
  records: readonly SheetRecord[],
): readonly ManualMetricRecord[] {
  return records.map((record) => ({
    Date: text(record, "date"),
    Platform: text(record, "platform"),
    Account: text(record, "account"),
    "Spend USD": numeric(record, "spend_usd"),
  }));
}

export function toFinanceActualRecords(
  records: readonly SheetRecord[],
): readonly ManualMetricRecord[] {
  return records.map((record) => {
    // The workbook records month periods (YYYY-MM); a month counts toward the
    // selected range when its first day is inside it (ADR-003).
    const bounds = periodBounds(text(record, "period"));
    return {
      Date: bounds?.start ?? null,
      Category: text(record, "category"),
      "Amount USD": numeric(record, "actual_amount_usd"),
    };
  });
}

export function toDepletionRecords(records: readonly SheetRecord[]): readonly ManualMetricRecord[] {
  return records.map((record) => ({
    Date: text(record, "movement_date"),
    Reason: text(record, "reason"),
    Quantity: numeric(record, "quantity"),
  }));
}

export function toPartnerPerformanceRecords(
  records: readonly SheetRecord[],
): readonly ManualMetricRecord[] {
  return records.map((record) => {
    const bounds = periodBounds(text(record, "period"));
    return {
      "Period Start": bounds?.start ?? null,
      "Period End": bounds?.end ?? null,
      // The workbook does not capture a partner type; the builder tolerates null.
      "Partner Type": null,
      Partner: text(record, "partner_name"),
      Platform: text(record, "platform"),
      Orders: numeric(record, "orders"),
      "Revenue USD": numeric(record, "revenue_usd"),
      "Commission USD": numeric(record, "commission_usd"),
      "Payout Status": text(record, "payout_status"),
    };
  });
}

const PIPELINE_STATUS_LABELS: Readonly<Record<string, string>> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
  stalled: "Stalled",
};

export function toGrowthPipelineRecords(
  records: readonly SheetRecord[],
): readonly ManualMetricRecord[] {
  return records.map((record) => {
    const status = text(record, "status");
    return {
      "Opportunity ID": text(record, "record_id"),
      "Opportunity Name": text(record, "opportunity"),
      "Pipeline Type": text(record, "pipeline_type"),
      Stage: text(record, "stage"),
      Status: status === null ? null : (PIPELINE_STATUS_LABELS[status] ?? status),
      "Value USD": numeric(record, "value_usd"),
      "Next Action": text(record, "next_action"),
      "Due Date": text(record, "next_action_date"),
      "Last Activity Date": text(record, "last_activity_date"),
      Owner: text(record, "owner"),
    };
  });
}

export function toSocialMetricsRecords(
  records: readonly SheetRecord[],
): readonly ManualMetricRecord[] {
  return records.map((record) => ({
    Date: text(record, "snapshot_date"),
    Platform: text(record, "platform"),
    Account: text(record, "account"),
    Followers: numeric(record, "followers"),
    Impressions: numeric(record, "impressions"),
    Reach: numeric(record, "reach"),
    Engagements: numeric(record, "engagements"),
    "Link Clicks": numeric(record, "link_clicks"),
  }));
}

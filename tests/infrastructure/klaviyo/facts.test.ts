import { describe, expect, it } from "vitest";

import {
  mapKlaviyoEmailOverviewFact,
  mapKlaviyoPerformanceRows,
  mapKlaviyoSmsFact,
  mapKlaviyoTrendPoints,
  mergeKlaviyoEngagementPoints,
} from "@/src/infrastructure/klaviyo/facts";
import {
  normalizeKlaviyoAggregate,
  normalizeKlaviyoReportRows,
} from "@/src/infrastructure/klaviyo/normalization";

const emailRow = {
  groupings: { campaign_id: "CAMP1", send_channel: "email" },
  statistics: {
    recipients: 1_000,
    delivered: 980,
    delivery_rate: 0.98,
    opens_unique: 490,
    open_rate: 0.5,
    clicks_unique: 98,
    click_rate: 0.1,
    click_to_open_rate: 0.2,
    bounced: 20,
    bounce_rate: 0.02,
    unsubscribe_uniques: 5,
    unsubscribe_rate: 0.005102,
    spam_complaints: 1,
    spam_complaint_rate: 0.00102,
    conversions: 12,
    conversion_rate: 0.012,
    conversion_value: 1_234.56,
    average_order_value: 102.88,
    revenue_per_recipient: 1.23456,
  },
};

const smsRow = {
  groupings: { campaign_id: "CAMP2", send_channel: "sms" },
  statistics: {
    recipients: 200,
    delivered: 190,
    delivery_rate: 0.95,
    opens_unique: null,
    open_rate: null,
    clicks_unique: 30,
    click_rate: 0.157,
    click_to_open_rate: null,
    bounced: 10,
    bounce_rate: 0.05,
    unsubscribe_uniques: 2,
    unsubscribe_rate: 0.0105,
    spam_complaints: null,
    spam_complaint_rate: null,
    conversions: 3,
    conversion_rate: 0.015,
    conversion_value: 250,
    average_order_value: 83.33,
    revenue_per_recipient: 1.25,
  },
};

describe("Klaviyo performance rows", () => {
  it("maps report rows with basis-point rates, minor-unit money, and names", () => {
    const rows = mapKlaviyoPerformanceRows({
      rows: normalizeKlaviyoReportRows([emailRow, smsRow]),
      groupingIdKey: "campaign_id",
      namesById: new Map([["CAMP1", "Welcome Campaign"]]),
    });
    expect(rows[0]).toMatchObject({
      id: "CAMP1",
      name: "Welcome Campaign",
      channel: "email",
      recipients: 1_000,
      deliveryRateBasisPoints: 9_800,
      openRateBasisPoints: 5_000,
      clickRateBasisPoints: 1_000,
      conversionValueMinorUnits: 123_456,
      revenuePerRecipientMinorUnits: 123,
    });
    // Unknown campaign IDs fall back to the ID, never invented names.
    expect(rows[1]).toMatchObject({ id: "CAMP2", name: "CAMP2", channel: "sms" });
  });

  it("returns empty performance for an account with no report rows", () => {
    expect(
      mapKlaviyoPerformanceRows({
        rows: normalizeKlaviyoReportRows([]),
        groupingIdKey: "flow_id",
        namesById: new Map(),
      }),
    ).toEqual([]);
  });
});

describe("Klaviyo overview facts", () => {
  it("aggregates email rows only and derives rates from summed counts", () => {
    const fact = mapKlaviyoEmailOverviewFact(normalizeKlaviyoReportRows([emailRow, smsRow]));
    expect(fact).toMatchObject({
      recipients: 1_000,
      delivered: 980,
      deliveryRateBasisPoints: 9_800,
      openRateBasisPoints: 5_000,
      clickToOpenRateBasisPoints: 2_000,
      conversionValueMinorUnits: 123_456,
    });
  });

  it("returns null overviews when the channel has no rows (no fabricated zeros)", () => {
    expect(mapKlaviyoEmailOverviewFact(normalizeKlaviyoReportRows([smsRow]))).toBeNull();
    expect(mapKlaviyoSmsFact(normalizeKlaviyoReportRows([emailRow]))).toBeNull();
  });

  it("maps SMS rows with send-date semantics", () => {
    expect(mapKlaviyoSmsFact(normalizeKlaviyoReportRows([smsRow]))).toEqual({
      sent: 200,
      deliveredOrReceived: 190,
      clicked: 30,
      failed: 10,
      unsubscribed: 2,
      measurementLabel: "report_send_date",
    });
  });
});

describe("Klaviyo engagement trend points", () => {
  it("merges aggregate series by date and keeps genuinely missing values null", () => {
    const series = normalizeKlaviyoAggregate({
      dates: ["2026-07-01", "2026-07-02", "2026-07-03"],
      data: [
        {
          dimensions: ["email"],
          measurements: { count: [5, null, 2], unique: [4, null, 2], sum_value: [0, null, 0] },
        },
        {
          dimensions: ["sms"],
          measurements: { count: [1, null, 0], unique: [1, null, 0], sum_value: [0, null, 0] },
        },
      ],
    });
    expect(mapKlaviyoTrendPoints(series)).toEqual([
      { period: "2026-07-01", count: 6 },
      { period: "2026-07-02", count: null },
      { period: "2026-07-03", count: 2 },
    ]);
  });

  it("returns an empty list for an account with zero events", () => {
    expect(mapKlaviyoTrendPoints(normalizeKlaviyoAggregate({ dates: [], data: [] }))).toEqual([]);
  });

  it("keeps opens and clicks as separate aligned series", () => {
    expect(
      mergeKlaviyoEngagementPoints(
        [
          { period: "2026-06", count: 10 },
          { period: "2026-07", count: 12 },
        ],
        [
          { period: "2026-06", count: 2 },
          { period: "2026-08", count: 3 },
        ],
      ),
    ).toEqual([
      { period: "2026-06", opens: 10, clicks: 2 },
      { period: "2026-07", opens: 12, clicks: null },
      { period: "2026-08", opens: null, clicks: 3 },
    ]);
  });
});

import { describe, expect, it } from "vitest";

import {
  buildKlaviyoEmailOverview,
  buildKlaviyoEngagementSeries,
  buildKlaviyoPerformanceTable,
  buildKlaviyoSmsOverview,
} from "@/src/application/metrics";

import { context, source } from "./fixtures";

const performance = {
  recipients: 100,
  delivered: 95,
  deliveryRateBasisPoints: 9500,
  opensUnique: 50,
  openRateBasisPoints: 5000,
  clicksUnique: 10,
  clickRateBasisPoints: 1000,
  clickToOpenRateBasisPoints: 2000,
  bounced: 5,
  bounceRateBasisPoints: 500,
  unsubscribesUnique: 1,
  unsubscribeRateBasisPoints: 100,
  spamComplaints: 0,
  spamComplaintRateBasisPoints: 0,
  conversions: 4,
  conversionValueMinorUnits: 25000,
  revenuePerRecipientMinorUnits: 250,
} as const;

describe("B5 Klaviyo future-ready metric services", () => {
  it("returns truthful no-activity values for the empty production account", () => {
    const results = buildKlaviyoEmailOverview(
      context([source("klaviyo", "no_activity")], "production"),
      null,
    );
    expect(results.every(({ value }) => value === null)).toBe(true);
    expect(results.every(({ readiness }) => readiness.state === "no_activity")).toBe(true);
    expect(
      results.every(({ implementationStatus }) => implementationStatus === "DATA_PENDING"),
    ).toBe(true);
  });

  it("maps deterministic TEST report facts without treating attributed revenue as company revenue", () => {
    const results = buildKlaviyoEmailOverview(context([source("klaviyo")]), performance);
    expect(results.find(({ key }) => key === "klaviyo.email_open_rate")?.value).toEqual({
      kind: "rate_basis_points",
      value: 5000,
    });
    const attributed = results.find(({ key }) => key === "klaviyo.attributed_revenue");
    expect(attributed?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 25000 },
    });
    expect(attributed?.warnings).toContain("KLAVIYO_ATTRIBUTED_REVENUE_NOT_COMPANY_REVENUE");
  });

  it("keeps campaign and flow rows PII-free and send-date labelled", () => {
    const table = buildKlaviyoPerformanceTable(context([source("klaviyo")]), "campaign", [
      { id: "campaign-1", name: "Synthetic Launch", channel: "email", ...performance },
    ]);
    expect(table.metric.key).toBe("klaviyo.campaign_performance");
    expect(table.metric.warnings).toContain("KLAVIYO_SEND_DATE_SEMANTICS");
    expect(table.rows[0]).not.toHaveProperty("email");
    expect(table.rows[0]).not.toHaveProperty("profile");
  });

  it("keeps SMS and engagement trend time semantics explicit", () => {
    const sms = buildKlaviyoSmsOverview(context([source("klaviyo")]), {
      sent: 100,
      deliveredOrReceived: 96,
      clicked: 8,
      failed: 4,
      unsubscribed: 1,
      measurementLabel: "event_time",
    });
    const trend = buildKlaviyoEngagementSeries(context([source("klaviyo")]), "day", [
      { period: "2026-07-01T04:00:00.000Z", count: 0 },
      { period: "2026-07-02T04:00:00.000Z", count: 3 },
    ]);
    expect(sms[0]?.warnings).toContain("KLAVIYO_EVENT_TIME_SEMANTICS");
    expect(sms[0]?.warnings).not.toContain("KLAVIYO_SEND_DATE_SEMANTICS");
    expect(trend.metric.value).toEqual({ kind: "count", value: 3 });
    expect(trend.metric.warnings).toContain("KLAVIYO_EVENT_TIME_SEMANTICS");
  });
});

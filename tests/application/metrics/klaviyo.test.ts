import { describe, expect, it } from "vitest";

import {
  buildKlaviyoEmailOverview,
  buildKlaviyoEmailFunnelTable,
  buildKlaviyoDemographicBreakdowns,
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
      { period: "2026-07-01T04:00:00.000Z", opens: 0, clicks: 0 },
      { period: "2026-07-02T04:00:00.000Z", opens: 3, clicks: 1 },
    ]);
    expect(sms[0]?.warnings).toContain("KLAVIYO_EVENT_TIME_SEMANTICS");
    expect(sms[0]?.warnings).not.toContain("KLAVIYO_SEND_DATE_SEMANTICS");
    expect(trend.metric.value).toEqual({ kind: "count", value: 4 });
    expect(trend.points[1]?.seriesValues).toEqual({
      opens: { kind: "count", value: 3 },
      clicks: { kind: "count", value: 1 },
    });
    expect(trend.metric.warnings).toContain("KLAVIYO_EVENT_TIME_SEMANTICS");
  });

  it("preserves provider-certified funnel rates instead of recomputing sequential rates", () => {
    const funnel = buildKlaviyoEmailFunnelTable(context([source("klaviyo")]), performance);
    expect(funnel.metric.key).toBe("klaviyo.email_funnel");
    expect(funnel.rows).toEqual([
      { stage: "Emails sent", count: 100, rateBasisPoints: null },
      { stage: "Delivered", count: 95, rateBasisPoints: 9500 },
      { stage: "Opened", count: 50, rateBasisPoints: 5000 },
      { stage: "Clicked", count: 10, rateBasisPoints: 1000 },
    ]);
  });

  it("publishes demographic shares with snapshot and coverage disclosures", () => {
    const [age, gender] = buildKlaviyoDemographicBreakdowns(context([source("klaviyo")]), {
      totalProfiles: 10,
      declaredAgeProfiles: 8,
      invalidAgeProfiles: 1,
      ageBands: [
        { label: "25–34", profiles: 5 },
        { label: "35–44", profiles: 3 },
      ],
      genders: [
        { label: "Female", profiles: 6 },
        { label: "Undisclosed", profiles: 4 },
      ],
      truncated: false,
    });
    expect(age?.items.map(({ label, values }) => [label, values[0]])).toEqual([
      ["25–34", { kind: "rate_basis_points", value: 6250 }],
      ["35–44", { kind: "rate_basis_points", value: 3750 }],
    ]);
    expect(age?.metric.warnings).toContain("KLAVIYO_AGE_COVERAGE_PARTIAL");
    expect(age?.metric.warnings).toContain("KLAVIYO_AGE_VALUES_EXCLUDED");
    expect(gender?.items.at(-1)?.label).toBe("Undisclosed");
    expect(gender?.metric.warnings).toContain("KLAVIYO_PROFILE_SNAPSHOT");
  });
});

import { describe, expect, it } from "vitest";

import {
  buildAffiliateMarketingViews,
  buildBlockedCampaignRoi,
  buildCollaborationViews,
  buildMarketingSpendMonthlyBreakdown,
  buildPaidCacMetric,
  buildSocialMarketingViews,
} from "@/src/application/metrics";

import { context, source } from "./fixtures";

const sheetsContext = () => context([source("google_sheets")]);
const combinedContext = () => context([source("google_sheets"), source("shopify")]);

describe("Marketing Intelligence certified calculations", () => {
  it("totals approved spend by month without adding attribution", () => {
    const result = buildMarketingSpendMonthlyBreakdown(sheetsContext(), [
      { date: "2026-07-01", spend_usd: 10 },
      { date: "2026-07-15", spend_usd: 15.5 },
      { date: "2026-08-01", spend_usd: 100 },
    ]);
    expect(result.metric.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 2550 },
    });
    expect(result.items).toHaveLength(1);
    expect(result.metric.warnings).toContain("SPEND_ONLY_NO_ATTRIBUTION");
  });

  describe("Paid CAC", () => {
    it("divides in-period paid spend by attributed first-time customers", () => {
      // (100 + 50) / (8 + 2) = 15.00. The August row is outside the period.
      const metric = buildPaidCacMetric(sheetsContext(), [
        { date: "2026-07-01", spend_usd: 100, new_customers_acquired: 8 },
        { date: "2026-07-20", spend_usd: 50, new_customers_acquired: 2 },
        { date: "2026-08-01", spend_usd: 900, new_customers_acquired: 1 },
      ]);
      expect(metric.value).toEqual({
        kind: "money",
        value: { currency: "USD", minorUnits: 1500 },
      });
      expect(metric.warnings).toContain("PAID_CAC_PLATFORM_REPORTED");
      expect(metric.warnings).not.toContain("PAID_CAC_SPEND_COVERAGE_PARTIAL");
    });

    it("excludes a campaign with no attributed customers from both sides", () => {
      // The uncounted $900 must not inflate the cost of the other campaign's
      // customers: the answer stays 100/8, not 1000/8.
      const metric = buildPaidCacMetric(sheetsContext(), [
        { date: "2026-07-01", spend_usd: 100, new_customers_acquired: 8 },
        { date: "2026-07-02", spend_usd: 900, new_customers_acquired: null },
        { date: "2026-07-03", spend_usd: 400, new_customers_acquired: 0 },
      ]);
      expect(metric.value).toEqual({
        kind: "money",
        value: { currency: "USD", minorUnits: 1250 },
      });
      expect(metric.warnings).toContain("PAID_CAC_SPEND_COVERAGE_PARTIAL");
    });

    it("never substitutes conversions for attributed first-time customers", () => {
      const metric = buildPaidCacMetric(sheetsContext(), [
        { date: "2026-07-01", spend_usd: 1850, conversions: 132, new_customers_acquired: null },
      ]);
      expect(metric.value).toBeNull();
      expect(metric.warnings).toContain("PAID_CAC_SPEND_COVERAGE_PARTIAL");
      // "No activity" would read as "no campaigns ran" — the opposite of the truth.
      expect(metric.unavailableReason).toBe(
        "Paid campaigns ran, but none reported attributed first-time customers.",
      );
    });

    it("returns null rather than zero when no campaign has spend", () => {
      const metric = buildPaidCacMetric(sheetsContext(), []);
      expect(metric.value).toBeNull();
      expect(metric.warnings).toContain("PAID_CAC_PLATFORM_REPORTED");
      expect(metric.unavailableReason).toBe("No paid campaign spend in the selected period.");
    });
  });

  it("uses latest as-of social snapshots without carrying future values backward", () => {
    const result = buildSocialMarketingViews(
      sheetsContext(),
      [
        { snapshot_date: "2026-06-30", platform: "instagram", account: "brand", followers: 900 },
        { snapshot_date: "2026-07-15", platform: "instagram", account: "brand", followers: 1_000 },
        { snapshot_date: "2026-07-31", platform: "instagram", account: "brand", followers: 1_100 },
        { snapshot_date: "2026-07-31", platform: "tiktok", account: "brand", followers: 500 },
        { snapshot_date: "2026-08-01", platform: "youtube", account: "brand", followers: 200 },
      ],
      [
        {
          period_start: "2026-07-01",
          period_end: "2026-07-31",
          platform: "instagram",
          account: "brand",
          mentions: 25,
          audience_reach: 10_000,
          attributed_net_sales_usd: 125,
          attribution_source: "approved-link-report",
          source_reference: "ref-1",
        },
      ],
    );
    expect(result.followers.value).toEqual({ kind: "count", value: 1_600 });
    expect(result.followers.warnings).toContain("SOCIAL_FOLLOWER_COVERAGE_PARTIAL");
    expect(result.growth.points).toEqual([
      {
        period: "2026-07",
        value: null,
        seriesValues: {
          instagram: { kind: "count", value: 1_100 },
          tiktok: { kind: "count", value: 500 },
          youtube: null,
        },
      },
    ]);
    expect(result.table.rows[0]).toMatchObject({
      channel: "Instagram",
      followers: 1_100,
      growthRateBasisPoints: 2_222,
      revenueMinorUnits: 12_500,
      audienceReach: 10_000,
    });
  });

  it("excludes overlapping social periods instead of double counting them", () => {
    const snapshots = [
      { snapshot_date: "2026-07-31", platform: "instagram", account: "brand", followers: 1_000 },
    ];
    const performance = [
      {
        period_start: "2026-07-01",
        period_end: "2026-07-20",
        platform: "instagram",
        account: "brand",
        mentions: 10,
      },
      {
        period_start: "2026-07-15",
        period_end: "2026-07-31",
        platform: "instagram",
        account: "brand",
        mentions: 20,
      },
    ];
    const result = buildSocialMarketingViews(sheetsContext(), snapshots, performance);
    expect(result.mentions.items).toEqual([]);
    expect(result.mentions.metric.warnings).toContain("SOCIAL_PERFORMANCE_PERIOD_OVERLAP");
  });

  it("splits active collaboration scope from active and scheduled chart/table scope", () => {
    const result = buildCollaborationViews(sheetsContext(), [
      {
        record_id: "live",
        pipeline_type: "collaboration",
        opportunity: "Live partner",
        collaboration_category: "Retail",
        collaboration_lifecycle: "live",
        collaboration_start_date: "2026-06-01",
        audience_reach: 1_000,
        launch_date: "2026-06-15",
      },
      {
        record_id: "scheduled",
        pipeline_type: "collaboration",
        opportunity: "Future partner",
        collaboration_category: "Creator",
        collaboration_lifecycle: "scheduled",
        launch_date: "2026-09-01",
        audience_reach: 2_000,
      },
      {
        record_id: "completed",
        pipeline_type: "collaboration",
        opportunity: "Old partner",
        collaboration_lifecycle: "completed",
        audience_reach: 9_000,
      },
    ]);
    expect(result.active.value).toEqual({ kind: "count", value: 1 });
    expect(result.reach.items.map(({ label }) => label)).toEqual([
      "Future partner",
      "Live partner",
    ]);
    expect(result.table.rows).toHaveLength(2);
  });

  it("joins ambassador sessions and sales only through unique exact mappings", () => {
    const rows = [
      {
        period: "2026-07",
        partner_id: "a1",
        partner_name: "Amina",
        partner_type: "ambassador",
        clicks: 12,
        shopify_discount_code: "AMINA10",
        utm_source: "instagram",
        utm_campaign: "ambassadors",
        utm_content: "amina",
        commission_usd: 20,
      },
    ];
    const result = buildAffiliateMarketingViews(
      combinedContext(),
      rows,
      [
        {
          utmSource: "instagram",
          utmCampaign: "ambassadors",
          utmContent: "amina",
          sessions: 40,
        },
        { utmSource: "instagram", utmCampaign: "other", utmContent: "amina", sessions: 99 },
      ],
      [
        { discountCode: "AMINA10", orders: 3, netSalesMinorUnits: 12_500 },
        { discountCode: "OTHER", orders: 8, netSalesMinorUnits: 50_000 },
      ],
    );
    expect(result.active.value).toEqual({ kind: "count", value: 1 });
    expect(result.sessions.value).toEqual({ kind: "count", value: 40 });
    expect(result.revenue.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 12_500 },
    });
    expect(result.table.rows[0]).toMatchObject({ orders: 3, commissionMinorUnits: 2_000 });
    expect(result.roi.metric.implementationStatus).toBe("BUSINESS_RULE_REQUIRED");
    expect(buildBlockedCampaignRoi(combinedContext()).metric.implementationStatus).toBe(
      "BUSINESS_RULE_REQUIRED",
    );
  });

  it("blocks affected affiliate results when mappings conflict", () => {
    const shared = {
      period: "2026-07",
      partner_type: "ambassador",
      clicks: 1,
      shopify_discount_code: "SHARED",
      utm_source: "instagram",
      utm_campaign: "ambassadors",
      utm_content: "shared",
    };
    const result = buildAffiliateMarketingViews(
      combinedContext(),
      [
        { ...shared, partner_id: "a1", partner_name: "One" },
        { ...shared, partner_id: "a2", partner_name: "Two" },
      ],
      [{ utmSource: "instagram", utmCampaign: "ambassadors", utmContent: "shared", sessions: 10 }],
      [{ discountCode: "SHARED", orders: 1, netSalesMinorUnits: 5_000 }],
    );
    expect(result.sessions.value).toBeNull();
    expect(result.revenue.value).toBeNull();
    expect(result.sessions.warnings).toContain("AFFILIATE_UTM_MAPPING_CONFLICT");
    expect(result.revenue.warnings).toContain("AFFILIATE_CODE_MAPPING_CONFLICT");
  });
});

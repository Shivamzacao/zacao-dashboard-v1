import { describe, expect, it } from "vitest";

import {
  buildGrantViews,
  buildGrowthPartnerViews,
  buildGrowthPipelineMetrics,
  buildGrowthSocialViews,
  buildInvestorViews,
} from "@/src/application/metrics";
import type { MetricServiceContext } from "@/src/application/metrics/types";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";

const context: MetricServiceContext = {
  environment: "test",
  dataPeriod: { startDate: "2026-07-01", endDate: "2026-07-31" },
  sourceStatuses: [
    {
      source: "google_sheets",
      state: "current",
      checkedAt: "2026-08-01T00:00:00.000Z",
      lastSuccessfulAt: "2026-08-01T00:00:00.000Z",
      dataAsOf: "2026-07-31T23:59:59.000Z",
      completeness: "complete",
      warningCodes: [],
    },
  ],
};

const row = (value: Record<string, string | number | null>): SheetRecord => value;

describe("Growth Intelligence certified calculations", () => {
  it("uses latest commercial snapshots without future carryback or funding rows", () => {
    const views = buildGrowthPipelineMetrics(
      context,
      [
        row({
          opportunity_id: "o1",
          snapshot_date: "2026-06-30",
          pipeline_type: "retail",
          growth_category: "wholesale",
          status: "open",
          value_usd: 100,
          probability_manual: 0.5,
          industry: "Grocery",
          opportunity: "Old",
        }),
        row({
          opportunity_id: "o1",
          snapshot_date: "2026-07-20",
          pipeline_type: "retail",
          growth_category: "wholesale",
          status: "open",
          value_usd: 200,
          probability_manual: 0.5,
          industry: "Grocery",
          opportunity: "Current",
          next_action: "Send samples",
          next_action_date: "2026-07-25",
        }),
        row({
          opportunity_id: "o2",
          snapshot_date: "2026-07-15",
          pipeline_type: "partnership",
          growth_category: "ambassador",
          status: "open",
          value_usd: null,
          probability_manual: 0.3,
          industry: null,
          opportunity: "Partial",
        }),
        row({
          opportunity_id: "won",
          snapshot_date: "2026-07-25",
          pipeline_type: "collaboration",
          status: "won",
          signed_date: "2026-07-20",
          first_contact_date: "2026-04-20",
          actual_value_usd: 300,
          opportunity: "Won",
        }),
        row({
          opportunity_id: "grant",
          snapshot_date: "2026-07-20",
          pipeline_type: "grant",
          status: "open",
          value_usd: 999,
        }),
        row({
          opportunity_id: "future",
          snapshot_date: "2026-08-01",
          pipeline_type: "retail",
          status: "open",
          value_usd: 999,
        }),
      ],
      [
        row({
          metric_key: "growth.time_to_close_target",
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          target_value: 3,
          unit: "months",
          scope_type: "company",
          status: "active",
        }),
      ],
    );

    expect(views.metrics.find((item) => item.key === "growth.open_pipeline")?.value).toEqual({
      kind: "count",
      value: 2,
    });
    expect(views.metrics.find((item) => item.key === "growth.open_pipeline_value")?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 20_000 },
    });
    expect(
      views.metrics.find((item) => item.key === "growth.open_pipeline_value")?.warnings,
    ).toContain("OPEN_PIPELINE_VALUE_COVERAGE_PARTIAL");
    expect(views.metrics.find((item) => item.key === "growth.weighted_pipeline")?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 10_000 },
    });
    expect(views.metrics.find((item) => item.key === "growth.closed_pipeline")?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 30_000 },
    });
    expect(views.metrics.find((item) => item.key === "growth.time_to_close")?.value).toEqual({
      kind: "quantity",
      value: 3,
    });
    expect(views.metrics.find((item) => item.key === "growth.time_to_close_target")?.value).toEqual(
      { kind: "quantity", value: 3 },
    );
    expect(views.byType.items.map((item) => item.label)).toEqual(["Wholesale", "Ambassador"]);
    expect(views.nextActions.rows[0]?.["opportunityName"]).toBe("Current");
  });

  it("uses month-end social as-of values without future-value carryback", () => {
    const social = buildGrowthSocialViews(context, [
      row({ snapshot_date: "2026-07-05", platform: "instagram", account: "main", followers: 100 }),
      row({ snapshot_date: "2026-07-10", platform: "tiktok", account: "main", followers: 50 }),
      row({ snapshot_date: "2026-08-01", platform: "youtube", account: "main", followers: 999 }),
    ]);
    expect(social.metric.value).toEqual({ kind: "count", value: 150 });
    expect(social.series.points).toEqual([
      { period: "2026-07", value: { kind: "count", value: 150 } },
    ]);
    expect(social.metric.warnings).toContain("SOCIAL_FOLLOWER_COVERAGE_PARTIAL");
  });

  it("uses exact partner codes and evidence-backed manual attribution", () => {
    const views = buildGrowthPartnerViews(
      context,
      [
        row({
          period: "2026-07",
          partner_id: "a1",
          partner_type: "ambassador",
          partner_name: "Amara",
          platform: "Instagram",
          shopify_discount_code: "AMARA",
          revenue_usd: 999,
          commission_usd: 10,
        }),
        row({
          period: "2026-07",
          partner_id: "c1",
          partner_type: "collaboration",
          partner_name: "Cafe",
          platform: "In-store",
          orders: 2,
          revenue_usd: 80,
          commission_usd: 0,
          attribution_source: "invoice",
          source_reference: "INV-1",
        }),
        row({
          period: "2026-07",
          partner_id: "c2",
          partner_type: "collaboration",
          partner_name: "Uncertified",
          revenue_usd: 100,
        }),
      ],
      [{ discountCode: "amara", orders: 3, netSalesMinorUnits: 12_000 }],
    );
    expect(views.metric.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 20_000 },
    });
    expect(views.table.rows[0]?.["revenueMinorUnits"]).toBe(12_000);
    expect(views.table.rows[2]?.["revenueMinorUnits"]).toBeNull();
    expect(views.metric.warnings).toContain("PARTNER_REVENUE_COVERAGE_PARTIAL");
  });

  it("selects investor snapshots and computes grant as-of measures", () => {
    const investors = buildInvestorViews(context, [
      row({
        investor_id: "i1",
        snapshot_date: "2026-07-01",
        investor: "Kindred",
        status: "active",
        display_priority: 2,
        interest_level: 4,
        check_size_usd: 100,
        stage: "Intro",
      }),
      row({
        investor_id: "i1",
        snapshot_date: "2026-07-20",
        investor: "Kindred",
        status: "active",
        display_priority: 1,
        interest_level: 5,
        check_size_usd: 250,
        stage: "Diligence",
      }),
      row({
        investor_id: "i2",
        snapshot_date: "2026-08-01",
        investor: "Future",
        status: "active",
        display_priority: 1,
      }),
    ]);
    expect(investors.metric.value).toEqual({ kind: "count", value: 1 });
    expect(investors.table.rows[0]).toMatchObject({
      investor: "Kindred",
      stage: "Diligence",
      interestLevel: 5,
    });

    const grants = buildGrantViews(context, [
      row({
        application_id: "g1",
        grant: "Grant A",
        submitted_date: "2026-07-03",
        requested_amount_usd: 100,
        status: "awarded",
        decision_date: "2026-07-20",
        awarded_amount_usd: 80,
      }),
      row({
        application_id: "g2",
        grant: "Grant B",
        submitted_date: "2026-07-29",
        requested_amount_usd: 50,
        status: "rejected",
        decision_date: "2026-07-31",
        awarded_amount_usd: null,
      }),
      row({
        application_id: "g3",
        grant: "Grant C",
        submitted_date: "2026-07-30",
        requested_amount_usd: 60,
        status: "submitted",
        decision_date: null,
        awarded_amount_usd: null,
      }),
      row({
        application_id: "future",
        grant: "Future",
        submitted_date: "2026-08-01",
        requested_amount_usd: 60,
        status: "awarded",
        decision_date: "2026-08-02",
        awarded_amount_usd: 60,
      }),
    ]);
    expect(grants.secured.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 8_000 },
    });
    expect(grants.submitted.value).toEqual({ kind: "count", value: 3 });
    expect(grants.acceptance.value).toEqual({ kind: "rate_basis_points", value: 5_000 });
    expect(grants.rolling.items.map((item) => item.values[0]?.value)).toEqual([2, 3, 3]);
  });
});

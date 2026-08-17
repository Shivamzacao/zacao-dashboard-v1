import { describe, expect, it } from "vitest";

import {
  buildBlendedCacMetric,
  buildPaidAcquisitionViews,
} from "@/src/application/metrics/blended-cac";
import { createMetricViewModel } from "@/src/application/metrics/view-model";
import { usd } from "@/src/domain/utilities/money";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";

import { PERIOD, context, source } from "./fixtures";

const combinedContext = () => context([source("google_sheets"), source("shopify")]);

function spendRow(overrides: Partial<SheetRecord> = {}): SheetRecord {
  return {
    record_id: "MS-1",
    date: "2026-07-05",
    platform: "meta",
    account: "ZACAO Meta",
    spend_usd: 500,
    ...overrides,
  };
}

function order(
  orderId: string,
  customerId: string,
  orderDate: string,
  firstOrderDate: string,
  overrides: Partial<SheetRecord> = {},
): SheetRecord {
  return {
    order_id: orderId,
    customer_id: customerId,
    order_date: orderDate,
    first_order_date: firstOrderDate,
    gross_product_sales_usd: 100,
    discounts_usd: 10,
    refunds_returns_usd: 0,
    cancellations_usd: 0,
    net_product_revenue_usd: 90,
    order_status: "paid",
    acquisition_channel: "Online Store",
    currency: "USD",
    is_test: "no",
    data_as_of: "2026-08-11",
    ...overrides,
  };
}

const build = (
  spendRows: readonly SheetRecord[],
  orderRecords: readonly SheetRecord[],
  sourceWarnings: readonly string[] = [],
) =>
  buildBlendedCacMetric({
    context: combinedContext(),
    spendRows,
    orderRecords,
    sourceWarnings,
  });

describe("Paid-Media Blended CAC", () => {
  it("divides in-scope spend by unique first-time Shopify customers", () => {
    // (500 + 300) / 4 first-time customers = 200.00
    const metric = build(
      [
        spendRow({ record_id: "MS-1", spend_usd: 500 }),
        spendRow({ record_id: "MS-2", platform: "tiktok", spend_usd: 300 }),
      ],
      [
        order("O-1", "C-1", "2026-07-02", "2026-07-02"),
        order("O-2", "C-2", "2026-07-03", "2026-07-03"),
        order("O-3", "C-3", "2026-07-04", "2026-07-04"),
        order("O-4", "C-4", "2026-07-05", "2026-07-05"),
        // Repeat purchase by an existing customer: not an acquisition.
        order("O-5", "C-1", "2026-07-20", "2026-07-02"),
      ],
    );

    expect(metric.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 20_000 },
    });
  });

  it("excludes amazon_ads and klaviyo spend from the numerator", () => {
    // Only the 500 meta row counts: 500 / 2 = 250.00
    const metric = build(
      [
        spendRow({ record_id: "MS-1", spend_usd: 500 }),
        spendRow({ record_id: "MS-2", platform: "amazon_ads", spend_usd: 900 }),
        spendRow({ record_id: "MS-3", platform: "klaviyo", spend_usd: 400 }),
      ],
      [
        order("O-1", "C-1", "2026-07-02", "2026-07-02"),
        order("O-2", "C-2", "2026-07-03", "2026-07-03"),
      ],
    );

    expect(metric.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 25_000 },
    });
  });

  it("counts spend whose attributed-customer column is blank, and ignores cac_usd", () => {
    // The workbook's $1,850 Meta row has no new_customers_acquired and a zero-filled
    // cac_usd. Campaign Paid CAC skips such a row; blended CAC must not, because its
    // denominator comes from Shopify. 1850 / 2 = 925.00
    const metric = build(
      [
        spendRow({
          record_id: "MS-1",
          spend_usd: 1_850,
          conversions: 132,
          new_customers_acquired: null,
          cac_usd: 0,
          roas: 0,
        }),
      ],
      [
        order("O-1", "C-1", "2026-07-02", "2026-07-02"),
        order("O-2", "C-2", "2026-07-03", "2026-07-03"),
      ],
    );

    expect(metric.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 92_500 },
    });
  });

  it("counts spend only inside the reporting period", () => {
    // Period is 2026-07-01..2026-07-31; only the July row counts. 500 / 1 = 500.00
    const metric = build(
      [
        spendRow({ record_id: "MS-1", date: "2026-06-30", spend_usd: 999 }),
        spendRow({ record_id: "MS-2", date: "2026-07-05", spend_usd: 500 }),
        spendRow({ record_id: "MS-3", date: "2026-08-01", spend_usd: 999 }),
      ],
      [order("O-1", "C-1", "2026-07-02", "2026-07-02")],
    );

    expect(metric.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 50_000 },
    });
  });

  it("always discloses the scope limits of the join", () => {
    const metric = build([spendRow()], [order("O-1", "C-1", "2026-07-02", "2026-07-02")]);

    expect(metric.warnings).toContain("BLENDED_CAC_SHOPIFY_ONLY_DENOMINATOR");
    expect(metric.warnings).toContain("BLENDED_CAC_PAID_MEDIA_SPEND_ONLY");
    expect(metric.warnings).toContain("BLENDED_CAC_NOT_COMPANY_WIDE");
    expect(metric.warnings).toContain("BLENDED_CAC_SCOPE_EXCLUDES_AMAZON_KLAVIYO");
    expect(metric.warnings).toContain("BLENDED_CAC_GUEST_CHECKOUTS_EXCLUDED");
  });

  it("withholds rather than publishing zero when spend ran but nobody was acquired", () => {
    const metric = build([spendRow()], [order("O-1", "C-1", "2026-07-02", "2026-01-15")]);

    expect(metric.value).toBeNull();
    expect(metric.unavailableReason).toBe(
      "Paid media spend ran, but no Shopify customer placed a first order in this period.",
    );
  });

  it("withholds when customers were acquired without in-scope spend", () => {
    const metric = build(
      [spendRow({ platform: "amazon_ads" })],
      [order("O-1", "C-1", "2026-07-02", "2026-07-02")],
    );

    expect(metric.value).toBeNull();
    expect(metric.unavailableReason).toBe("No in-scope paid media spend in the selected period.");
  });

  it("reports partial and warns that the denominator may be overstated on truncated history", () => {
    const metric = build(
      [spendRow()],
      [order("O-1", "C-1", "2026-07-02", "2026-07-02")],
      ["SHOPIFY_ORDER_HISTORY_TRUNCATED"],
    );

    expect(metric.value).not.toBeNull();
    expect(metric.readiness.state).toBe("partial");
    expect(metric.warnings).toContain("BLENDED_CAC_DENOMINATOR_MAY_BE_OVERSTATED");
    expect(metric.warnings).toContain("SHOPIFY_ORDER_HISTORY_TRUNCATED");
  });

  it("counts customers dropped by the first-order consistency guard", () => {
    const metric = build(
      [spendRow()],
      [
        order("O-1", "C-1", "2026-07-02", "2026-07-02"),
        order("INC-1", "C-9", "2026-07-04", "2026-07-04"),
        order("INC-2", "C-9", "2026-07-06", "2026-07-05"),
      ],
    );

    // 500 / 1 surviving customer = 500.00, and the loss is stated.
    expect(metric.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 50_000 },
    });
    expect(metric.warnings).toContain("BLENDED_CAC_EXCLUDED_INCONSISTENT_FIRST_ORDER:2");
    expect(metric.readiness.state).toBe("partial");
  });

  it("withholds without throwing when both sources are empty", () => {
    const metric = build([], []);

    expect(metric.value).toBeNull();
    expect(metric.unavailableReason).toBe("No in-scope paid media spend in the selected period.");
  });
});

describe("90-Day LTV : Paid-Media Blended CAC", () => {
  const ltvMetric = (minorUnits: number | null) =>
    createMetricViewModel({
      metricKey: "customers.ltv_90d",
      environment: "test",
      dataPeriod: PERIOD,
      sources: [source("shopify")],
      value: minorUnits === null ? null : { kind: "money", value: usd(minorUnits) },
      ...(minorUnits === null
        ? { dataPendingReason: "Matured 90-day cohorts cover 4 customers; 30 are required." }
        : {}),
    });

  const views = (
    spendRows: readonly SheetRecord[],
    orderRecords: readonly SheetRecord[],
    ltvMinorUnits: number | null = 17_309,
  ) =>
    buildPaidAcquisitionViews({
      context: combinedContext(),
      spendRows,
      orderRecords,
      ltv90d: ltvMetric(ltvMinorUnits),
    });

  // The live July 2026 case: the workbook's one production row against the three Shopify
  // customers acquired that month, and the real $173.09 LTV.
  const julyCustomers = [
    order("O-1", "C-1", "2026-07-02", "2026-07-02"),
    order("O-2", "C-2", "2026-07-03", "2026-07-03"),
    order("O-3", "C-3", "2026-07-04", "2026-07-04"),
  ];
  const julySpend = [spendRow({ record_id: "MKT-1", date: "2026-07-05", spend_usd: 1_850 })];

  it("stores the ratio in hundredths, not basis points", () => {
    // $1,850 / 3 = $616.67 CAC. 17,309c x 100 / 61,667c = 28 -> the KPI formatter
    // renders `28 / 100` as "0.28 : 1". Using basis points here would render 100x high.
    const { cac, ltvCac } = views(julySpend, julyCustomers);

    expect(cac.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 61_667 } });
    expect(ltvCac.value).toEqual({ kind: "rate_basis_points", value: 28 });
  });

  it("publishes when every counted customer was acquired in a month that had spend", () => {
    const { ltvCac } = views(julySpend, julyCustomers);

    expect(ltvCac.value).not.toBeNull();
    expect(ltvCac.warnings).toContain("LTV_CAC_PERIOD_SCOPE_APPROXIMATE");
    expect(ltvCac.warnings.some((code) => code.startsWith("LTV_CAC_SPEND_COVERAGE_THIN"))).toBe(
      false,
    );
  });

  it("never reports better than partial, because the two sides cover different windows", () => {
    const { ltvCac } = views(julySpend, julyCustomers);

    expect(ltvCac.readiness.state).toBe("partial");
  });

  it("withholds when the period spans months the spend never covered", () => {
    // This is the misleading reading the guard exists to stop. Widen the period to three
    // months while spend stays in July alone: the denominator picks up May and June
    // customers that no advertising bought, so the ratio would look far healthier than
    // the truth. Coverage is 1/3 = 33%.
    const wide = {
      environment: "test" as const,
      dataPeriod: { startDate: "2026-05-01", endDate: "2026-07-31" },
      sourceStatuses: [source("google_sheets"), source("shopify")],
    };
    const { cac, ltvCac } = buildPaidAcquisitionViews({
      context: wide,
      spendRows: julySpend,
      orderRecords: [
        order("O-1", "C-1", "2026-07-02", "2026-07-02"),
        order("O-2", "C-2", "2026-05-10", "2026-05-10"),
        order("O-3", "C-3", "2026-06-10", "2026-06-10"),
      ],
      ltv90d: ltvMetric(17_309),
    });

    // The CAC itself still publishes — $1,850 over 3 customers — which is exactly why
    // the ratio needs its own guard rather than relying on the denominator being absent.
    expect(cac.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 61_667 } });
    expect(ltvCac.value).toBeNull();
    expect(ltvCac.warnings).toContain("LTV_CAC_SPEND_COVERAGE_THIN:33");
    expect(ltvCac.unavailableReason).toBe(
      "Only 33% of this period's first-time customers fall in months with recorded paid spend, so the ratio would not be comparable.",
    );
  });

  it("withholds when the LTV base is too thin to divide", () => {
    const { ltvCac } = views(julySpend, julyCustomers, null);

    expect(ltvCac.value).toBeNull();
    expect(ltvCac.unavailableReason).toBe("The 90-day LTV base is too thin to publish a ratio.");
  });

  it("passes the CAC's own reason through when the denominator is absent", () => {
    const { ltvCac } = views([], julyCustomers);

    expect(ltvCac.value).toBeNull();
    expect(ltvCac.unavailableReason).toBe("No in-scope paid media spend in the selected period.");
  });

  it("carries both inputs' disclosures so the reader sees every limit that applies", () => {
    const { ltvCac } = views(julySpend, julyCustomers);

    expect(ltvCac.warnings).toContain("BLENDED_CAC_SHOPIFY_ONLY_DENOMINATOR");
    expect(ltvCac.warnings).toContain("BLENDED_CAC_GUEST_CHECKOUTS_EXCLUDED");
    expect(ltvCac.warnings).toContain("BLENDED_CAC_NOT_COMPANY_WIDE");
  });
});

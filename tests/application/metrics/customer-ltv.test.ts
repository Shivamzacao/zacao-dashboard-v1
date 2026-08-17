import { describe, expect, it } from "vitest";

import {
  buildRealizedLtvViews,
  calculateActiveCustomers,
  calculateRealizedLtv,
} from "@/src/application/metrics/customer-ltv";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";

import { context, source } from "./fixtures";

function order(
  orderId: string,
  customerId: string | null,
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

const mappings: readonly SheetRecord[] = [
  {
    source_channel_or_name: "Online Store",
    dashboard_channel: "DTC (Shopify)",
    effective_from: "2025-01-01",
    status: "active",
  },
  {
    source_channel_or_name: "Faire: Sell Wholesale",
    dashboard_channel: "Retail / Wholesale",
    effective_from: "2025-01-01",
    status: "active",
  },
];

describe("Realized LTV", () => {
  it("reconciles net product revenue with a one-cent tolerance", () => {
    const result = calculateRealizedLtv({
      records: [
        order("O-1", "C-1", "2026-01-05", "2026-01-05", {
          net_product_revenue_usd: 90.01,
        }),
        order("O-2", "C-2", "2026-01-05", "2026-01-05", {
          net_product_revenue_usd: 90.02,
        }),
      ],
      channelMapping: mappings,
      endDate: "2026-08-11",
    });

    expect(result.eligibleCustomers).toBe(1);
    expect(result.headlineMinorUnits).toBe(9_000);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ orderId: "O-2", reason: "net_revenue_mismatch" }),
    );
  });

  it("uses distinct eligible customers and excludes refunded, cancelled, and zero-value orders", () => {
    const result = calculateRealizedLtv({
      records: [
        order("O-1", "C-1", "2025-09-05", "2025-09-05"),
        order("O-2", "C-1", "2025-09-25", "2025-09-05", {
          gross_product_sales_usd: 0,
          discounts_usd: 0,
          refunds_returns_usd: 0,
          cancellations_usd: 20,
          net_product_revenue_usd: -20,
          order_status: "cancelled",
        }),
        order("O-3", "C-2", "2025-09-05", "2025-09-05", {
          discounts_usd: 0,
          refunds_returns_usd: 100,
          net_product_revenue_usd: 0,
          order_status: "refunded",
        }),
        order("O-4", "C-3", "2025-09-05", "2025-09-05", {
          gross_product_sales_usd: 0,
          discounts_usd: 0,
          cancellations_usd: 25,
          net_product_revenue_usd: -25,
          order_status: "cancelled",
        }),
      ],
      channelMapping: mappings,
      endDate: "2026-08-11",
    });

    expect(result.eligibleCustomers).toBe(1);
    expect(result.headlineMinorUnits).toBe(9_000);
  });

  it("counts active customers in the inclusive trailing 90-day window with identity fallback", () => {
    const records = [
      order("BOUNDARY", "C-1", "2026-05-14", "2026-05-14"),
      order("DUPLICATE-CUSTOMER", "C-1", "2026-08-10", "2026-05-14"),
      order("CONFIRMED", null, "2026-08-11", "2026-08-11", {
        normalized_email: " Buyer@Example.com ",
        order_status: "confirmed",
      }),
      order("PARTIAL", "C-3", "2026-08-11", "2026-08-11", {
        order_status: "partially_refunded",
      }),
      order("TOO-OLD", "C-4", "2026-05-13", "2026-05-13"),
      order("REFUNDED", "C-5", "2026-08-11", "2026-08-11", {
        refunds_returns_usd: 100,
        discounts_usd: 0,
        net_product_revenue_usd: 0,
        order_status: "refunded",
      }),
      order("UNPAID", "C-6", "2026-08-11", "2026-08-11", {
        order_status: "unpaid",
      }),
      order("SAMPLE", "C-7", "2026-08-11", "2026-08-11", { is_sample: "yes" }),
      order("ZERO", "C-8", "2026-08-11", "2026-08-11", {
        gross_product_sales_usd: 0,
        discounts_usd: 0,
        net_product_revenue_usd: 0,
      }),
      order("NO-ID", null, "2026-08-11", "2026-08-11"),
    ];

    expect(calculateActiveCustomers({ records, endDate: "2026-08-11" })).toEqual({
      count: 3,
      excludedWithoutIdentity: 1,
      malformedRows: 0,
    });
  });

  it("uses exact horizon boundaries and withholds immature monthly cohorts", () => {
    const result = calculateRealizedLtv({
      records: [
        order("O-1", "C-1", "2026-01-01", "2026-01-01"),
        order("O-2", "C-1", "2026-01-30", "2026-01-01"),
        order("O-3", "C-1", "2026-01-31", "2026-01-01"),
        order("O-4", "C-1", "2026-03-02", "2026-01-01"),
        order("O-5", "C-2", "2026-08-05", "2026-08-05"),
      ],
      channelMapping: mappings,
      endDate: "2026-08-11",
    });
    const january = result.cohorts.find(({ cohortMonth }) => cohortMonth === "2026-01");
    const august = result.cohorts.find(({ cohortMonth }) => cohortMonth === "2026-08");

    expect(january?.ltvMinorUnits["30d"]).toBe(18_000);
    expect(january?.ltvMinorUnits["60d"]).toBe(27_000);
    expect(january?.ltvMinorUnits["90d"]).toBe(36_000);
    expect(august?.maturity["30d"]).toBe(false);
    expect(august?.ltvMinorUnits["30d"]).toBeNull();
    expect(august?.ltvMinorUnits.lifetime).toBe(9_000);
  });

  // Cohorts are published to the dashboard as a table, so a customer identifier leaking
  // into a row would put PII in the payload. This assertion moved here from the
  // sheets-customers contributor test when that contributor was removed.
  it("aggregates cohorts without carrying any customer identifier", () => {
    const views = buildRealizedLtvViews({
      context: context([source("google_sheets")]),
      records: [
        order("O-1", "C-PRIVATE", "2026-01-05", "2026-01-05"),
        order("O-2", "C-PRIVATE", "2026-01-25", "2026-01-05", { net_product_revenue_usd: 50 }),
      ],
      channelMapping: mappings,
      channels: [],
    });

    expect(views.cohorts.rows).toEqual([
      expect.objectContaining({ cohortMonth: "2026-01", customerCount: 1 }),
    ]);
    expect(JSON.stringify(views.cohorts.rows)).not.toContain("C-PRIVATE");
  });

  describe("90-day LTV", () => {
    // The period ends 2026-07-31, so a cohort is 90-day matured when its month end
    // plus 89 days lands on or before that: 2026-04 is the last matured month.
    const cohort = (
      month: string,
      customers: number,
      ordersPerCustomer: number,
      offset = 0,
    ): readonly SheetRecord[] =>
      Array.from({ length: customers }, (_unused, index) =>
        Array.from({ length: ordersPerCustomer }, (_ignored, order_) =>
          order(
            `O-${month}-${index}-${order_}`,
            `C-${month}-${index + offset}`,
            `${month}-${String(2 + order_ * 3).padStart(2, "0")}`,
            `${month}-02`,
          ),
        ),
      ).flat();

    const build = (records: readonly SheetRecord[]) =>
      buildRealizedLtvViews({
        context: context([source("shopify")]),
        records,
        channelMapping: mappings,
        channels: [],
      }).ltv90d;

    it("weights matured cohorts by customer count", () => {
      // 20 customers at one $90 order, 10 at two: (20*9000 + 10*18000) / 30 = 12000.
      const metric = build([...cohort("2026-01", 20, 1), ...cohort("2026-03", 10, 2, 100)]);
      expect(metric.value).toEqual({
        kind: "money",
        value: { currency: "USD", minorUnits: 12_000 },
      });
    });

    it("ignores a cohort whose 90-day window has not elapsed", () => {
      const matured = [...cohort("2026-01", 20, 1), ...cohort("2026-03", 10, 2, 100)];
      // 2026-06 is immature, and every customer in it bought five times — if it
      // leaked into either side of the mean the value would move sharply.
      const withImmature = build([...matured, ...cohort("2026-06", 40, 5, 200)]);
      expect(withImmature.value).toEqual(build(matured).value);
    });

    it("withholds the value below thirty matured customers", () => {
      const metric = build(cohort("2026-01", 29, 1));
      expect(metric.value).toBeNull();
      expect(metric.warnings).toContain("LTV_COHORT_INSUFFICIENT_90D");
      // One customer short still withholds, so the floor is not off by one.
      expect(build(cohort("2026-01", 30, 1)).value).not.toBeNull();
    });

    it("publishes at exactly thirty, still flagging a thin base", () => {
      const metric = build(cohort("2026-01", 30, 1));
      expect(metric.value).toEqual({
        kind: "money",
        value: { currency: "USD", minorUnits: 9_000 },
      });
      expect(metric.warnings).toContain("LTV_COHORT_INSUFFICIENT_90D");
      expect(metric.readiness.state).toBe("partial");
    });

    it("drops the thin-base warning once the cohort reaches one hundred", () => {
      const metric = build(cohort("2026-01", 100, 1));
      expect(metric.value).not.toBeNull();
      expect(metric.warnings).not.toContain("LTV_COHORT_INSUFFICIENT_90D");
    });
  });

  it("excludes invalid identity, test, currency, status, date, duplicate, and inconsistent rows", () => {
    const result = calculateRealizedLtv({
      records: [
        order("DUP", "C-1", "2026-01-01", "2026-01-01"),
        order("DUP", "C-1", "2026-01-02", "2026-01-01"),
        order("GUEST", null, "2026-01-01", "2026-01-01"),
        order("TEST", "C-2", "2026-01-01", "2026-01-01", { is_test: "yes" }),
        order("EUR", "C-3", "2026-01-01", "2026-01-01", { currency: "EUR" }),
        order("STATUS", "C-4", "2026-01-01", "2026-01-01", { order_status: "pending" }),
        order("DATE", "C-5", "not-a-date", "2026-01-01"),
        order("INC-1", "C-6", "2026-01-01", "2026-01-01"),
        order("INC-2", "C-6", "2026-02-01", "2026-01-02"),
      ],
      channelMapping: mappings,
      endDate: "2026-08-11",
    });

    expect(new Set(result.diagnostics.map(({ reason }) => reason))).toEqual(
      new Set([
        "duplicate_order",
        "missing_customer",
        "test_order",
        "non_usd",
        "unsupported_status",
        "malformed_date",
        "inconsistent_first_order_date",
      ]),
    );
    expect(result.eligibleCustomers).toBe(1);
  });

  it("applies mapped acquisition-channel filters and warns for unmapped channels", () => {
    const records = [
      order("DTC", "C-1", "2026-01-01", "2026-01-01"),
      order("WHOLESALE", "C-2", "2026-01-01", "2026-01-01", {
        acquisition_channel: "Faire: Sell Wholesale",
      }),
      order("UNKNOWN", "C-3", "2026-01-01", "2026-01-01", {
        acquisition_channel: "Mystery",
      }),
    ];
    const all = calculateRealizedLtv({ records, channelMapping: mappings, endDate: "2026-08-11" });
    const filtered = calculateRealizedLtv({
      records,
      channelMapping: mappings,
      endDate: "2026-08-11",
      channels: ["DTC (Shopify)"],
    });

    expect(all.eligibleCustomers).toBe(3);
    expect(all.diagnostics).toContainEqual(
      expect.objectContaining({ orderId: "UNKNOWN", reason: "unmapped_channel" }),
    );
    expect(filtered.eligibleCustomers).toBe(1);
  });

  it("publishes truthful missing, partial, invalid, stale, and no-activity states", () => {
    const currentContext = context([source("google_sheets")]);
    const build = (records: readonly SheetRecord[], state: "current" | "stale" = "current") =>
      buildRealizedLtvViews({
        context: context([source("google_sheets", state)]),
        records,
        channelMapping: mappings,
        channels: [],
      }).metric;

    const missing = buildRealizedLtvViews({
      context: currentContext,
      records: [],
      channelMapping: mappings,
      channels: [],
    }).metric;
    expect(missing.value).toBeNull();
    expect(missing.warnings).toContain("LTV_SOURCE_ROWS_REQUIRED");

    const partial = build([
      order("VALID", "C-1", "2026-01-01", "2026-01-01"),
      order("INVALID", "C-2", "2026-01-01", "2026-01-01", { currency: "EUR" }),
    ]);
    expect(partial.readiness.state).toBe("partial");
    expect(partial.value).not.toBeNull();

    const invalid = build([
      order("INVALID", "C-1", "2026-01-01", "2026-01-01", { currency: "EUR" }),
    ]);
    expect(invalid.readiness.state).toBe("invalid");
    expect(invalid.value).toBeNull();

    const stale = build([order("STALE", "C-1", "2026-01-01", "2026-01-01")], "stale");
    expect(stale.readiness.state).toBe("stale");
    expect(stale.value).not.toBeNull();

    const noActivity = build([
      order("CANCELLED", "C-1", "2026-01-01", "2026-01-01", {
        gross_product_sales_usd: 0,
        discounts_usd: 0,
        cancellations_usd: 10,
        net_product_revenue_usd: -10,
        order_status: "cancelled",
      }),
    ]);
    expect(noActivity.readiness.state).toBe("no_activity");
    expect(noActivity.value).toBeNull();
  });
});

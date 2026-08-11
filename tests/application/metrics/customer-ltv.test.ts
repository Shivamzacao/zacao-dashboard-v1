import { describe, expect, it } from "vitest";

import {
  buildRealizedLtvViews,
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

  it("uses distinct eligible customers and includes later refunds and cancellations", () => {
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

    expect(result.eligibleCustomers).toBe(2);
    expect(result.headlineMinorUnits).toBe(3_500);
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

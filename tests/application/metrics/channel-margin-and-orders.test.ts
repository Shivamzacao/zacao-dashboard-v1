import { describe, expect, it } from "vitest";

import { buildRevenueChannelViews } from "@/src/application/metrics";
import { buildDetailedOrdersTable } from "@/src/application/metrics/shopify";
import type {
  DetailedOrderFact,
  MetricServiceContext,
  NativeChannelFact,
} from "@/src/application/metrics/types";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";
import type { SourceStatus } from "@/src/domain/contracts";

const current = (source: SourceStatus["source"]): SourceStatus => ({
  source,
  state: "current",
  checkedAt: "2026-08-08T00:00:00Z",
  lastSuccessfulAt: "2026-08-08T00:00:00Z",
  dataAsOf: "2026-08-07T23:59:59Z",
  completeness: "complete",
  warningCodes: [],
});

const context: MetricServiceContext = {
  environment: "production",
  dataPeriod: { startDate: "2026-07-08", endDate: "2026-08-07" },
  sourceStatuses: [current("shopify"), current("google_sheets")],
};

function fact(channel: string, netSalesMinorUnits: number, orders = 1): NativeChannelFact {
  return {
    channel,
    orders,
    netSalesMinorUnits,
    totalSalesMinorUnits: netSalesMinorUnits,
    averageOrderValueMinorUnits: netSalesMinorUnits,
  };
}

function mapping(source: string, dashboard: string): SheetRecord {
  return {
    source_system: "shopify",
    status: "active",
    source_channel_or_name: source,
    dashboard_channel: dashboard,
    effective_from: "2026-01-01",
    effective_to: null,
  };
}

describe("contribution margin by channel", () => {
  it("publishes a margin per priced channel and fills the performance table column", () => {
    const views = buildRevenueChannelViews(
      context,
      [fact("TikTok Shop", 899_00, 1)],
      [mapping("TikTok Shop", "TikTok Shop")],
    );
    expect(views.channelMargin.items).toHaveLength(1);
    expect(views.channelMargin.items[0]?.values[0]).toEqual({
      kind: "rate_basis_points",
      value: 6337,
    });
    // The column used to be hardcoded null, so the table rendered an empty
    // Margin cell next to certified revenue.
    const row = views.channelPerformance.rows.find((entry) => entry["channel"] === "TikTok Shop");
    expect(row?.["marginBasisPoints"]).toBe(6337);
  });

  it("never presents a placeholder-derived margin as certified", () => {
    const views = buildRevenueChannelViews(
      context,
      [fact("ShopMy", 899_00, 1)],
      [mapping("ShopMy", "ShopMy")],
    );
    expect(views.channelMargin.metric.value).not.toBeNull();
    expect(views.channelMargin.metric.readiness.state).toBe("partial");
    expect(views.channelMargin.metric.warnings).toContain("CHANNEL_FEES_PROVISIONAL");
    expect(views.channelMargin.metric.readiness.message).toMatch(/provisional/i);
  });

  it("discloses that COGS is blended even when every rate is approved", () => {
    const views = buildRevenueChannelViews(
      context,
      [fact("TikTok Shop", 899_00, 1)],
      [mapping("TikTok Shop", "TikTok Shop")],
    );
    expect(views.channelMargin.metric.warnings).toContain("MARGIN_ESTIMATED_FROM_BLENDED_COGS");
  });

  it("leaves unpriced revenue out of the blended rate rather than guessing at it", () => {
    const views = buildRevenueChannelViews(
      context,
      // Unclassified revenue dwarfs the priced channel. If it were folded into the
      // denominator at zero margin it would drag the company rate toward zero and
      // read as a collapse in profitability.
      [fact("TikTok Shop", 899_00, 1), fact("Unclassified", 50_000_00, 40)],
      [mapping("TikTok Shop", "TikTok Shop")],
    );
    expect(views.channelMargin.items.map((item) => item.key)).not.toContain("Unclassified");
    expect(views.channelMargin.metric.value).toEqual({ kind: "rate_basis_points", value: 6337 });
    expect(views.channelMargin.metric.warnings).toContain("CHANNEL_ECONOMICS_MISSING");
  });

  it("reports no margin at all when nothing sold", () => {
    const views = buildRevenueChannelViews(context, [], []);
    expect(views.channelMargin.metric.value).toBeNull();
    expect(views.channelMargin.items).toHaveLength(0);
  });
});

describe("detailed orders drill-down", () => {
  const order = (overrides: Partial<DetailedOrderFact> = {}): DetailedOrderFact => ({
    orderDate: "2026-08-01",
    channel: "Online Store",
    amountMinorUnits: 40_90,
    quantity: 4,
    ...overrides,
  });

  it("exposes only the four approved columns", () => {
    const table = buildDetailedOrdersTable(context, [order()]);
    expect(table.columns).toEqual(["orderDate", "channel", "amountMinorUnits", "quantity"]);
  });

  it("carries no customer-identifying field in any row", () => {
    const table = buildDetailedOrdersTable(context, [order()]);
    const keys = Object.keys(table.rows[0] ?? {});
    // Order-level Shopify data is where names, emails and addresses live. None of
    // them are fetched, and none may appear here.
    for (const forbidden of ["customer", "customerId", "email", "phone", "name", "address"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("lists newest orders first", () => {
    const table = buildDetailedOrdersTable(context, [
      order({ orderDate: "2026-07-02" }),
      order({ orderDate: "2026-08-05" }),
      order({ orderDate: "2026-07-20" }),
    ]);
    expect(table.rows.map((row) => row["orderDate"])).toEqual([
      "2026-08-05",
      "2026-07-20",
      "2026-07-02",
    ]);
  });

  it("keeps an unknown quantity null instead of calling it zero", () => {
    const table = buildDetailedOrdersTable(context, [order({ quantity: null })]);
    expect(table.rows[0]?.["quantity"]).toBeNull();
  });

  it("reports no value when the period has no orders", () => {
    const table = buildDetailedOrdersTable(context, []);
    expect(table.metric.value).toBeNull();
    expect(table.rows).toHaveLength(0);
  });
});

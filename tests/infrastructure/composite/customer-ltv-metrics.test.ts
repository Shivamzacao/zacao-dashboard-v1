import { describe, expect, it, vi } from "vitest";

import type { OrchestrationContext } from "@/src/application/orchestration";
import type { SheetRecord, SheetsTabDataSource } from "@/src/application/ports/sheets-tabs";
import type { SourceStatus } from "@/src/domain/contracts";
import { createCustomerLtvContributor } from "@/src/infrastructure/composite/customer-ltv-metrics";
import type { ShopifyAdapterProvider } from "@/src/infrastructure/shopify/contributors";
import { normalizeOrder } from "@/src/infrastructure/shopify/normalization";

const sheetsStatus: SourceStatus = {
  source: "google_sheets",
  state: "current",
  checkedAt: "2026-08-01T12:00:00.000Z",
  lastSuccessfulAt: "2026-08-01T12:00:00.000Z",
  dataAsOf: "2026-07-31T00:00:00.000Z",
  completeness: "complete",
  warningCodes: [],
};

const context: OrchestrationContext = {
  environment: "production",
  dataPeriod: { startDate: "2026-07-01", endDate: "2026-07-31" },
  filters: {
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    channels: [],
    productSkus: [],
    locations: [],
  },
  reportingTimeZone: "America/New_York",
  currency: "USD",
  sourceStatuses: [],
};

const spendRows: readonly SheetRecord[] = [
  { record_id: "MS-1", date: "2026-07-05", platform: "meta", spend_usd: 600 },
  // Excluded by the approved platform scope, so it must not reach the numerator.
  { record_id: "MS-2", date: "2026-07-06", platform: "amazon_ads", spend_usd: 900 },
];

function sheetsWith(tabs: Readonly<Record<string, readonly SheetRecord[]>>): SheetsTabDataSource {
  return {
    sourceStatus: () => sheetsStatus,
    readPageTabs: async (_page, tabNames) => ({
      tabs: Object.fromEntries(tabNames.map((tab) => [tab, tabs[tab] ?? []])),
      sourceStatus: sheetsStatus,
      warnings: [],
    }),
  };
}

/** Raw Admin API order shape, normalized the same way the live adapter does. */
const rawOrder = (overrides: Record<string, unknown> = {}) => ({
  id: "gid://shopify/Order/1",
  name: "#1001",
  createdAt: "2026-07-04T15:00:00Z",
  processedAt: null,
  cancelledAt: null,
  test: false,
  currencyCode: "USD",
  sourceName: "web",
  tags: [],
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "FULFILLED",
  customer: { id: "gid://shopify/Customer/9" },
  currentSubtotalPriceSet: { shopMoney: { amount: "100.00", currencyCode: "USD" } },
  currentTotalPriceSet: { shopMoney: { amount: "110.00", currencyCode: "USD" } },
  currentTotalDiscountsSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
  currentShippingPriceSet: { shopMoney: { amount: "8.00", currencyCode: "USD" } },
  currentTotalTaxSet: { shopMoney: { amount: "2.00", currencyCode: "USD" } },
  totalRefundedSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
  netPaymentSet: { shopMoney: { amount: "110.00", currencyCode: "USD" } },
  refunds: [],
  fulfillments: [],
  ...overrides,
});

function shopifyWith(raw: readonly Record<string, unknown>[]): ShopifyAdapterProvider {
  const readOrders = vi.fn(async () => ({
    records: raw.map((value) => normalizeOrder(value)),
    truncated: false,
  }));
  return (async () => ({
    admin: { readOrders },
    hasReadAllOrders: true,
  })) as unknown as ShopifyAdapterProvider;
}

/** Two customers acquired in July, the first of them a repeat buyer. */
const julyOrders = [
  rawOrder({ id: "gid://shopify/Order/1", createdAt: "2026-07-04T15:00:00Z" }),
  rawOrder({ id: "gid://shopify/Order/2", createdAt: "2026-07-18T15:00:00Z" }),
  rawOrder({
    id: "gid://shopify/Order/3",
    createdAt: "2026-07-09T15:00:00Z",
    customer: { id: "gid://shopify/Customer/42" },
  }),
];

describe("Customer LTV contributor: Blended CAC", () => {
  it("joins workbook spend to Shopify first-time customers and carries both sources", async () => {
    const contributor = createCustomerLtvContributor({
      sheets: sheetsWith({ Marketing_Spend: spendRows }),
      shopify: shopifyWith(julyOrders),
      sourceIdentity: "test",
      now: () => new Date("2026-08-01T12:00:00.000Z"),
    });

    const result = await contributor.load(context);
    const cac = result.metrics?.find(({ key }) => key === "marketing.cac");

    // 600 in-scope spend / 2 first-time customers = 300.00. The repeat order by C-1
    // does not add a third customer, and the amazon_ads row is not in the numerator.
    expect(cac?.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 30_000 } });
    expect(cac?.sources.map(({ source }) => source).sort()).toEqual(["google_sheets", "shopify"]);
    expect(cac?.warnings).toContain("BLENDED_CAC_SHOPIFY_ONLY_DENOMINATOR");
  });

  it("leaves the existing LTV metrics on Shopify alone", async () => {
    const contributor = createCustomerLtvContributor({
      sheets: sheetsWith({ Marketing_Spend: spendRows }),
      shopify: shopifyWith(julyOrders),
      sourceIdentity: "test",
      now: () => new Date("2026-08-01T12:00:00.000Z"),
    });

    const result = await contributor.load(context);

    // Widening these to the sheets status would change their readiness for a source
    // they do not read.
    for (const key of ["customers.active", "customers.realized_ltv", "customers.ltv_90d"]) {
      expect(result.metrics?.find((metric) => metric.key === key)?.sources).toEqual([
        expect.objectContaining({ source: "shopify" }),
      ]);
    }
  });

  it("reports an unknown numerator rather than zero spend when the workbook cannot be read", async () => {
    const contributor = createCustomerLtvContributor({
      sheets: {
        sourceStatus: () => sheetsStatus,
        readPageTabs: async () => {
          throw new Error("sheets unavailable");
        },
      },
      shopify: shopifyWith(julyOrders),
      sourceIdentity: "test",
      now: () => new Date("2026-08-01T12:00:00.000Z"),
    });

    const result = await contributor.load(context);
    const cac = result.metrics?.find(({ key }) => key === "marketing.cac");

    expect(cac?.value).toBeNull();
    expect(cac?.unavailableReason).toBe(
      "Marketing_Spend could not be read, so the spend numerator is unknown.",
    );
    expect(cac?.warnings).toContain("BLENDED_CAC_SPEND_SOURCE_UNREADABLE");
  });

  it("withholds without a workbook configured at all", async () => {
    const contributor = createCustomerLtvContributor({
      sheets: null,
      shopify: shopifyWith(julyOrders),
      sourceIdentity: "test",
      now: () => new Date("2026-08-01T12:00:00.000Z"),
    });

    const result = await contributor.load(context);
    const cac = result.metrics?.find(({ key }) => key === "marketing.cac");

    expect(cac?.value).toBeNull();
    expect(cac?.warnings).toContain("BLENDED_CAC_SPEND_SOURCE_UNREADABLE");
  });
});

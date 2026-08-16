import { describe, expect, it, vi } from "vitest";

import type { OrchestrationContext } from "@/src/application/orchestration";
import type {
  SheetRecord,
  SheetsDashboardPage,
  SheetsTabDataSource,
} from "@/src/application/ports/sheets-tabs";
import type { SourceStatus } from "@/src/domain/contracts";
import { createGrowthCompositeContributor } from "@/src/infrastructure/composite/growth-metrics";
import type { ShopifyAdapterProvider } from "@/src/infrastructure/shopify/contributors";

const status: SourceStatus = {
  source: "google_sheets",
  state: "current",
  checkedAt: "2026-08-12T12:00:00.000Z",
  lastSuccessfulAt: "2026-08-12T12:00:00.000Z",
  dataAsOf: "2026-08-12T00:00:00.000Z",
  completeness: "complete",
  warningCodes: [],
};

const context: OrchestrationContext = {
  environment: "production",
  dataPeriod: { startDate: "2026-07-14", endDate: "2026-08-12" },
  filters: {
    startDate: "2026-07-14",
    endDate: "2026-08-12",
    channels: [],
    productSkus: [],
    locations: [],
  },
  reportingTimeZone: "America/New_York",
  currency: "USD",
  sourceStatuses: [],
};

/** Records the page it was asked for so the workbook routing can be asserted. */
function fakeSheets(rows: readonly SheetRecord[]) {
  const pagesRead: SheetsDashboardPage[] = [];
  const sheets: SheetsTabDataSource = {
    sourceStatus: () => status,
    readPageTabs: async (page, tabNames) => {
      pagesRead.push(page);
      return {
        tabs: Object.fromEntries(tabNames.map((tab) => [tab, rows])),
        exampleTabs: Object.fromEntries(tabNames.map((tab) => [tab, []])),
        sourceStatus: status,
        warnings: [],
      };
    },
  };
  return { sheets, pagesRead };
}

function fakeShopify(): ShopifyAdapterProvider {
  const read = vi.fn(async () => ({
    rows: [{ discount_code: "NICKR", orders: "12", net_sales: "1085.58" }],
    columns: [],
  }));
  return (async () => ({ shopifyql: { read } })) as unknown as ShopifyAdapterProvider;
}

describe("Growth composite contributor", () => {
  it("reads the legacy growth page by default", async () => {
    const { sheets, pagesRead } = fakeSheets([]);

    await createGrowthCompositeContributor({
      sheets,
      shopify: fakeShopify(),
      sourceIdentity: "shop",
      now: () => new Date("2026-08-12T12:00:00.000Z"),
    }).load(context);

    expect(pagesRead).toEqual(["growth"]);
  });

  it("reads the migrated workbook when a page is supplied", async () => {
    const { sheets, pagesRead } = fakeSheets([]);

    await createGrowthCompositeContributor({
      sheets,
      shopify: fakeShopify(),
      sourceIdentity: "shop",
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      page: "migrated",
    }).load(context);

    expect(pagesRead).toEqual(["migrated"]);
  });

  it("takes partner revenue from Shopify, not from the sheet", async () => {
    // The sheet supplies the partner and its discount code; the money comes from
    // ShopifyQL. This is why an empty System Partner Sales tab blocks nothing.
    const { sheets } = fakeSheets([
      {
        record_id: "AP-P1-2026-08",
        period: "2026-08",
        partner_id: "P1",
        partner_name: "Nick R.",
        partner_type: "affiliate",
        code_or_link: "nickr",
        shopify_discount_code: "NICKR",
        source_status: "production",
      },
    ]);

    const contribution = await createGrowthCompositeContributor({
      sheets,
      shopify: fakeShopify(),
      sourceIdentity: "shop",
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      page: "migrated",
    }).load(context);

    expect(contribution.breakdowns?.[0]?.items?.[0]).toMatchObject({
      values: [{ kind: "money", value: { currency: "USD", minorUnits: 108_558 } }],
    });
  });
});

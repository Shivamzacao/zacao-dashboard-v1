import { describe, expect, it, vi } from "vitest";

import type { OrchestrationContext } from "@/src/application/orchestration";
import type { SheetsTabDataSource } from "@/src/application/ports/sheets-tabs";
import type { SourceStatus } from "@/src/domain/contracts";
import { createV1CompositeContributor } from "@/src/infrastructure/composite/v1-metrics";
import type { ShopifyAdapterProvider } from "@/src/infrastructure/shopify/contributors";

const sheetsStatus: SourceStatus = {
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

describe("V1 composite Sheet example fallback", () => {
  it("classifies live revenue with example mappings when production mappings are absent", async () => {
    const sheets: SheetsTabDataSource = {
      sourceStatus: () => sheetsStatus,
      readPageTabs: async (_page, tabNames) => ({
        tabs: Object.fromEntries(tabNames.map((tab) => [tab, []])),
        exampleTabs: {
          Channel_Mapping: [
            {
              source_system: "shopify",
              source_channel_or_name: "Online Store",
              dashboard_channel: "DTC — Site",
              effective_from: "2025-01-01",
              status: "active",
              source_status: "example",
            },
          ],
        },
        sourceStatus: sheetsStatus,
        warnings: [],
      }),
    };
    const read = vi.fn(async ({ dataset }: { readonly dataset: string }) => ({
      rows:
        dataset === "native_channels"
          ? [
              {
                sales_channel: "Online Store",
                orders: 2,
                net_sales: "150.00",
                total_sales: "160.00",
                average_order_value: "80.00",
              },
            ]
          : [],
      columns: [],
      history: {
        mode: "aggregate" as const,
        completeness: "complete" as const,
        requestedStartDate: context.dataPeriod.startDate,
        requestedEndDate: context.dataPeriod.endDate,
        earliestDetailedRecordAt: null,
        hasReadAllOrders: false,
        warningCodes: [],
      },
      requestId: null,
    }));
    const shopify = (async () => ({
      shopifyql: { read },
      admin: {},
      hasReadAllOrders: false,
    })) as unknown as ShopifyAdapterProvider;
    const contributor = createV1CompositeContributor({
      sheets,
      shopify,
      sourceIdentity: "test",
      now: () => new Date("2026-08-12T12:00:00.000Z"),
    });

    const result = await contributor.load(context);

    expect(result.metrics?.find(({ key }) => key === "revenue.dtc_total")?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 15_000 },
    });
    expect(
      result.tables?.find(({ metric }) => metric.key === "revenue.channel_mix")?.rows[0],
    ).toMatchObject({
      channel: "DTC — Site",
    });
    expect(result.sourceStatuses[0]).toMatchObject({ state: "partial", completeness: "partial" });
    expect(result.warnings).toContain("SYNTHETIC_EXAMPLE_DATA");
  });
});

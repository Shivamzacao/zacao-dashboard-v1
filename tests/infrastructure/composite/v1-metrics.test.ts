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
    const readProducts = vi.fn(async () => ({
      records: [],
      truncated: false,
      history: {
        mode: "detailed" as const,
        completeness: "partial" as const,
        requestedStartDate: context.dataPeriod.startDate,
        requestedEndDate: context.dataPeriod.endDate,
        earliestDetailedRecordAt: null,
        hasReadAllOrders: false,
        warningCodes: [],
      },
    }));
    const shopify = (async () => ({
      shopifyql: { read },
      admin: { readProducts },
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

  it("maps live Shopify inventory with disclosed operational Sheet examples", async () => {
    const sheets: SheetsTabDataSource = {
      sourceStatus: () => sheetsStatus,
      readPageTabs: async (_page, tabNames) => ({
        tabs: Object.fromEntries(
          tabNames.map((tab) => [
            tab,
            tab === "Inventory_Snapshots"
              ? [{ snapshot_at: "2026-08-12", warehouse: "YBYD", sku: "SKU-01", on_hand: 6 }]
              : [],
          ]),
        ),
        exampleTabs: {
          SKU_Master: [
            {
              sku_id: "SKU-01",
              canonical_name: "Smooth",
              shopify_variant_sku: "SHOP-10",
              pack_size_bars: 10,
              is_active: "yes",
            },
          ],
          Location_Master: [
            {
              location_name: "Store",
              shopify_location_name: "Store",
              is_active: "yes",
            },
            { location_name: "YBYD", shopify_location_name: null, is_active: "yes" },
          ],
          Metric_Targets: [
            {
              metric_key: "inventory.stock_min",
              scope_type: "sku",
              scope_value: "SKU-01",
              period_start: "2026-01-01",
              period_end: "2026-12-31",
              target_value: 20,
              status: "active",
            },
            {
              metric_key: "inventory.stock_max",
              scope_type: "sku",
              scope_value: "SKU-01",
              period_start: "2026-01-01",
              period_end: "2026-12-31",
              target_value: 60,
              status: "active",
            },
          ],
        },
        sourceStatus: sheetsStatus,
        warnings: [],
      }),
    };
    const read = vi.fn(async () => ({
      rows: [],
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
    const readProducts = vi.fn(async () => ({
      records: [
        {
          id: "P1",
          title: "Smooth",
          handle: "smooth",
          status: "ACTIVE",
          variants: [
            {
              id: "V1",
              title: "10-Pack",
              sku: "SHOP-10",
              price: { currency: "USD", minorUnits: 8_500 },
              inventoryQuantity: 4,
              sellableOnlineQuantity: 4,
              inventoryItem: {
                id: "I1",
                sku: "SHOP-10",
                tracked: true,
                unitCost: null,
                inventoryLevels: [
                  {
                    id: "IL1",
                    updatedAt: "2026-08-12T00:00:00.000Z",
                    location: { id: "L1", name: "Store", isActive: true },
                    quantities: { on_hand: 4, available: 4 },
                  },
                ],
              },
            },
          ],
        },
      ],
      truncated: false,
      history: {
        mode: "detailed" as const,
        completeness: "partial" as const,
        requestedStartDate: context.dataPeriod.startDate,
        requestedEndDate: context.dataPeriod.endDate,
        earliestDetailedRecordAt: null,
        hasReadAllOrders: false,
        warningCodes: [],
      },
    }));
    const shopify = (async () => ({
      shopifyql: { read },
      admin: { readProducts },
      hasReadAllOrders: false,
    })) as unknown as ShopifyAdapterProvider;
    const contributor = createV1CompositeContributor({
      sheets,
      shopify,
      sourceIdentity: "test",
      now: () => new Date("2026-08-12T12:00:00.000Z"),
    });

    const result = await contributor.load(context);

    expect(
      result.breakdowns?.find(({ metric }) => metric.key === "inventory.shopify_current")?.metric
        .value,
    ).toEqual({ kind: "count", value: 40 });
    expect(
      result.breakdowns?.find(({ metric }) => metric.key === "inventory.combined")?.metric.value,
    ).toEqual({ kind: "quantity", value: 46 });
    expect(result.metrics?.find(({ key }) => key === "inventory.stock_health")?.value).toEqual({
      kind: "status",
      value: "1 of 1 in band",
    });
    expect(result.sourceStatuses[0]).toMatchObject({ state: "partial", completeness: "partial" });
    expect(result.warnings).toContain("SYNTHETIC_EXAMPLE_DATA");
  });
});

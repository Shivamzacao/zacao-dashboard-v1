import { describe, expect, it, vi } from "vitest";

import type { OrchestrationContext } from "@/src/application/orchestration";
import type { SheetsTabDataSource } from "@/src/application/ports/sheets-tabs";
import type { SourceStatus } from "@/src/domain/contracts";
import { createProductSheetMetricsContributor } from "@/src/infrastructure/composite/product-metrics";
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

describe("Product Sheet example contributor", () => {
  it("combines live Shopify product facts with disclosed Sheet examples", async () => {
    const exampleTabs = {
      SKU_Master: [
        {
          sku_id: "SKU-01",
          canonical_name: "Smooth",
          shopify_variant_sku: "SHOP-01",
          pack_size_bars: 10,
          is_active: "yes",
          source_status: "example",
        },
      ],
      COGS_By_SKU: [
        {
          sku: "SKU-01",
          effective_from: "2026-08-01",
          effective_to: "2026-08-31",
          cost_basis: "landed",
          total_unit_cost_usd: 1.42,
          source_status: "example",
        },
      ],
      Inventory_Snapshots: [
        {
          snapshot_at: "2026-07-13 00:00",
          warehouse: "Warehouse",
          sku: "SKU-01",
          available: 100,
          on_hand: 100,
          source_status: "example",
        },
      ],
      Production_Orders: [
        {
          received_date: "2026-07-20",
          received_units: 20,
          units: 20,
          source_status: "example",
        },
      ],
    };
    const sheets: SheetsTabDataSource = {
      sourceStatus: () => status,
      readPageTabs: async (_page, tabNames) => ({
        tabs: Object.fromEntries(tabNames.map((tab) => [tab, []])),
        exampleTabs,
        sourceStatus: status,
        warnings: [],
      }),
    };
    const read = vi.fn(async ({ dataset }: { readonly dataset: string }) => ({
      rows:
        dataset === "product_units_weekly"
          ? [
              {
                week: "2026-08-10",
                line_type: "product",
                product_variant_sku: "SHOP-01",
                sales_channel: "Online Store",
                net_items_sold: 10,
              },
            ]
          : [
              {
                line_type: "product",
                product_title: "Smooth",
                product_variant_title: "Pack",
                product_variant_sku: "SHOP-01",
                net_sales: "200.00",
                orders: 10,
                net_items_sold: 10,
              },
            ],
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
              title: "Pack",
              sku: "SHOP-01",
              price: { currency: "USD", minorUnits: 2_000 },
              inventoryQuantity: 20,
              sellableOnlineQuantity: 18,
              inventoryItem: {
                id: "I1",
                sku: "SHOP-01",
                tracked: true,
                unitCost: null,
                inventoryLevels: [
                  {
                    id: "IL1",
                    updatedAt: "2026-08-12T00:00:00.000Z",
                    location: { id: "L1", name: "Store", isActive: true },
                    quantities: { on_hand: 20, available: 18 },
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
    const contributor = createProductSheetMetricsContributor({
      sheets,
      shopify,
      sourceIdentity: "test",
      now: () => new Date("2026-08-12T12:00:00.000Z"),
    });

    const result = await contributor.load(context);

    expect(
      result.breakdowns?.find(({ metric }) => metric.key === "inventory.on_hand_bars")?.metric
        .value,
    ).toEqual({ kind: "quantity", value: 200 });
    expect(result.metrics?.find(({ key }) => key === "inventory.weeks_cover")?.value).toEqual({
      kind: "quantity",
      value: 7.2,
    });
    expect(
      result.tables?.find(({ metric }) => metric.key === "products.sku_margin")?.rows,
    ).toHaveLength(1);
    expect(result.sourceStatuses[0]).toMatchObject({ state: "partial", completeness: "partial" });
    expect(result.warnings).toContain("SYNTHETIC_EXAMPLE_DATA");
  });
});

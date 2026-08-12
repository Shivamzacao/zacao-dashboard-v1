import { describe, expect, it } from "vitest";

import {
  buildProductInventoryBreakdown,
  buildProductSkuMarginViews,
  buildProductWeeksCoverMetric,
} from "@/src/application/metrics";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";

const context = {
  environment: "production" as const,
  dataPeriod: { startDate: "2026-07-14", endDate: "2026-08-12" },
  sourceStatuses: [
    {
      source: "google_sheets" as const,
      state: "partial" as const,
      checkedAt: "2026-08-12T12:00:00.000Z",
      lastSuccessfulAt: "2026-08-12T12:00:00.000Z",
      dataAsOf: "2026-08-12T00:00:00.000Z",
      completeness: "partial" as const,
      warningCodes: ["SYNTHETIC_EXAMPLE_DATA"],
    },
    {
      source: "shopify" as const,
      state: "current" as const,
      checkedAt: "2026-08-12T12:00:00.000Z",
      lastSuccessfulAt: "2026-08-12T12:00:00.000Z",
      dataAsOf: "2026-08-12T12:00:00.000Z",
      completeness: "complete" as const,
      warningCodes: [],
    },
  ],
};

const mappings: readonly SheetRecord[] = [
  {
    sku_id: "SKU-01",
    canonical_name: "Smooth",
    shopify_variant_sku: "SHOP-01",
    pack_size_bars: 10,
    is_active: "yes",
  },
  {
    sku_id: "SKU-02",
    canonical_name: "Dark",
    shopify_variant_sku: "SHOP-02",
    pack_size_bars: 4,
    is_active: "yes",
  },
];

const inventory = [
  {
    locationId: "L1",
    locationName: "Store",
    productTitle: "Smooth",
    variantTitle: "Pack",
    sku: "SHOP-01",
    quantityName: "on_hand",
    quantity: 12,
    updatedAt: "2026-08-12T00:00:00Z",
  },
  {
    locationId: "L1",
    locationName: "Store",
    productTitle: "Smooth",
    variantTitle: "Pack",
    sku: "SHOP-01",
    quantityName: "available",
    quantity: 10,
    updatedAt: "2026-08-12T00:00:00Z",
  },
  {
    locationId: "L1",
    locationName: "Store",
    productTitle: "Dark",
    variantTitle: "Pack",
    sku: "SHOP-02",
    quantityName: "on_hand",
    quantity: 5,
    updatedAt: "2026-08-12T00:00:00Z",
  },
  {
    locationId: "L1",
    locationName: "Store",
    productTitle: "Dark",
    variantTitle: "Pack",
    sku: "SHOP-02",
    quantityName: "available",
    quantity: 5,
    updatedAt: "2026-08-12T00:00:00Z",
  },
];

describe("Product Sheet-backed metrics", () => {
  it("converts live Shopify inventory to canonical bars and computes weeks of cover", () => {
    const position = buildProductInventoryBreakdown(context, inventory, mappings, [
      "SYNTHETIC_EXAMPLE_DATA",
    ]);
    const cover = buildProductWeeksCoverMetric(
      context,
      inventory,
      [
        {
          period: "trailing-28-days",
          product: "Smooth",
          variant: "Pack",
          sku: "SHOP-01",
          merchandise: true,
          units: 5,
        },
        {
          period: "trailing-28-days",
          product: "Dark",
          variant: "Pack",
          sku: "SHOP-02",
          merchandise: true,
          units: 5,
        },
      ],
      mappings,
    );

    expect(position.metric.value).toEqual({ kind: "quantity", value: 140 });
    expect(position.items.map((item) => [item.key, item.values[0]])).toEqual([
      ["SKU-01", { kind: "quantity", value: 120 }],
      ["SKU-02", { kind: "quantity", value: 20 }],
    ]);
    expect(cover.value).toEqual({ kind: "quantity", value: 6.9 });
    expect(position.metric.readiness.state).toBe("partial");
  });

  it("publishes SKU margin and a PII-free export table from disclosed landed costs", () => {
    const result = buildProductSkuMarginViews({
      context,
      sales: [
        {
          product: "Smooth",
          variant: "Pack",
          sku: "SHOP-01",
          merchandise: true,
          netSalesMinorUnits: 20_000,
        },
      ],
      units: [
        {
          period: "selected",
          product: "Smooth",
          variant: "Pack",
          sku: "SHOP-01",
          merchandise: true,
          units: 10,
        },
      ],
      mappings,
      costs: [
        {
          sku: "SKU-01",
          effective_from: "2026-08-01",
          effective_to: "2026-08-31",
          cost_basis: "landed",
          total_unit_cost_usd: 1.42,
        },
      ],
      warnings: ["SYNTHETIC_EXAMPLE_DATA"],
    });

    expect(result.breakdown.metric.value).toEqual({
      kind: "rate_basis_points",
      value: 2_900,
    });
    expect(result.table.rows).toEqual([
      {
        sku: "SKU-01",
        units: 10,
        revenueMinorUnits: 20_000,
        cogsPerBarMinorUnits: 142,
        targetPerBarMinorUnits: null,
        marginBasisPoints: 2_900,
        status: "Demo cost; target unavailable",
      },
    ]);
  });
});

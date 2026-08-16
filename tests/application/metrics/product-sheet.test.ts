import { describe, expect, it } from "vitest";

import {
  buildProductInventoryBreakdown,
  buildProductSkuMarginViews,
  buildProductWeeksCoverMetric,
  hasProductSkuMappings,
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

/**
 * The legacy workbook files 42% Cacao under SKU-01 and 70% Cacao under SKU-02 — the
 * reverse of the approved product master, and on example rows. Each name is paired
 * with its own correct variant, so inventory *labels* looked right; what crossed was
 * the sku_id join key, so COGS, targets and margin attached to the wrong product.
 * These pin the new workbook's mapping, which matches the product master.
 */
describe("canonical SKU to Shopify variant mapping", () => {
  const newWorkbookSkuMaster: SheetRecord[] = [
    {
      sku_id: "SKU-01",
      canonical_name: "70% Cacao Dark Chocolate",
      shopify_variant_sku: "ZAC-DC-70-4PK",
      pack_size_bars: 4,
      is_active: "yes",
    },
    {
      sku_id: "SKU-02",
      canonical_name: "42% Cacao Smooth Chocolate",
      shopify_variant_sku: "ZAC-MC-42-4PK",
      pack_size_bars: 4,
      is_active: "yes",
    },
  ];

  it("files each chocolate under the sku_id the product master assigns it", () => {
    const fact = (sku: string, quantity: number) => ({
      locationId: "L1",
      locationName: "SNAPL",
      productTitle: "Bar",
      variantTitle: "Pack",
      sku,
      quantityName: "on_hand",
      quantity,
      updatedAt: "2026-08-13T00:00:00.000Z",
    });
    const views = buildProductInventoryBreakdown(
      context,
      [fact("ZAC-DC-70-4PK", 2), fact("ZAC-MC-42-4PK", 145)],
      newWorkbookSkuMaster,
    );
    const bySku = new Map(views.items.map((item) => [item.label, item.values[0]]));
    // 2 packs x 4 bars of the 70%, 145 x 4 of the 42% — not the other way round.
    expect(bySku.get("70% Cacao Dark Chocolate")).toMatchObject({ value: 8 });
    expect(bySku.get("42% Cacao Smooth Chocolate")).toMatchObject({ value: 580 });
  });

  it("counts an unmapped pack variant through its mapped sibling", () => {
    // SKU_Master maps only ZAC-MC-42-4PK, but the store stocks the ten-pack.
    // Treating it as unknown dropped 580 bars from the total.
    const fact = (sku: string, quantity: number) => ({
      locationId: "L1",
      locationName: "SNAPL",
      productTitle: "Bar",
      variantTitle: "Pack",
      sku,
      quantityName: "on_hand",
      quantity,
      updatedAt: "2026-08-13T00:00:00.000Z",
    });
    const views = buildProductInventoryBreakdown(
      context,
      [fact("ZAC-DC-70-4PK", 2), fact("ZAC-MC-42-10PK", 58)],
      newWorkbookSkuMaster,
    );
    const bySku = new Map(views.items.map((item) => [item.label, item.values[0]]));
    // Pack size comes from the variant's own suffix: 58 x 10, not 58 x 4.
    expect(bySku.get("42% Cacao Smooth Chocolate")).toMatchObject({ value: 580 });
    expect(bySku.get("70% Cacao Dark Chocolate")).toMatchObject({ value: 8 });
    expect(views.metric.warnings).not.toContain("UNMAPPED_SHOPIFY_SKU:ZAC-MC-42-10PK");
  });

  it("covers weeks of cover from the same pack-variant resolution", () => {
    // Sellable stock sits almost entirely on the unmapped ten-pack, so an
    // explicit-only lookup left availableBars at zero and the KPI permanently
    // "data pending" — the same defect as the inventory breakdown, one function over.
    const stock = (sku: string, quantity: number) => ({
      locationId: "L1",
      locationName: "SNAPL",
      productTitle: "Bar",
      variantTitle: "Pack",
      sku,
      quantityName: "available",
      quantity,
      updatedAt: "2026-08-13T00:00:00.000Z",
    });
    const sold = (sku: string, units: number) => ({
      period: "trailing-28-days",
      product: "Bar",
      variant: "Pack",
      sku,
      merchandise: true,
      units,
    });
    const metric = buildProductWeeksCoverMetric(
      context,
      [stock("ZAC-MC-42-10PK", 56)],
      [sold("ZAC-MC-42-10PK", 7)],
      newWorkbookSkuMaster,
    );
    // 560 available bars over 70 sold in 28 days = 8 weeks of cover.
    expect(metric.value).toEqual({ kind: "quantity", value: 32 });
  });

  it("treats the mapping as usable only when a variant sku is present", () => {
    expect(hasProductSkuMappings(newWorkbookSkuMaster)).toBe(true);
    // SKU-03..05 are real rows with no Shopify product yet; they must not count.
    expect(
      hasProductSkuMappings([
        { sku_id: "SKU-03", canonical_name: "80% Fleur de Sel", pack_size_bars: 4 },
      ]),
    ).toBe(false);
  });
});

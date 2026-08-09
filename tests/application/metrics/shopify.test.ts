import { describe, expect, it } from "vitest";

import {
  buildCatalogTable,
  buildCustomerClassificationMetrics,
  buildInventoryBreakdown,
  buildMissingCostMetric,
  buildProductUnitsBreakdown,
  buildProductVelocityTable,
  buildShopifyFunnelTable,
} from "@/src/application/metrics";

import { context, source } from "./fixtures";

describe("B5 Shopify metric services", () => {
  it("uses provider customer classification and provider aggregate rate without identity inference", () => {
    const results = buildCustomerClassificationMetrics(context(), {
      rows: [
        { classification: "new", customers: 60 },
        { classification: "returning", customers: 40 },
        { classification: "unclassified", customers: 3 },
      ],
      returningRateBasisPoints: 4000,
    });
    expect(results.map(({ key, value }) => [key, value])).toEqual([
      ["customers.new_count", { kind: "count", value: 60 }],
      ["customers.returning_count", { kind: "count", value: 40 }],
      ["customers.returning_rate", { kind: "rate_basis_points", value: 4000 }],
    ]);
    expect(results[0]?.warnings).toContain("UNCLASSIFIED_CUSTOMER_ROWS");
  });

  it("preserves zero funnel counts as values and unavailable as a distinct state", () => {
    const zero = buildShopifyFunnelTable(context(), {
      sessions: 0,
      visitors: 0,
      cartAdditions: 0,
      reachedCheckout: 0,
      completedCheckout: 0,
      conversionRateBasisPoints: 0,
    });
    const unavailable = buildShopifyFunnelTable(context([source("shopify", "unavailable")]), {
      sessions: 100,
      visitors: 80,
      cartAdditions: 10,
      reachedCheckout: 5,
      completedCheckout: 2,
      conversionRateBasisPoints: 200,
    });
    expect(zero.metric.value).toEqual({ kind: "rate_basis_points", value: 0 });
    expect(zero.rows[0]).toEqual({ stage: "Sessions", count: 0 });
    expect(unavailable.metric.value).toBeNull();
    expect(unavailable.metric.readiness.state).toBe("unavailable");
  });

  it("excludes non-merchandise rows and discloses missing SKU mappings", () => {
    const facts = [
      {
        period: "2026-07",
        product: "Bar",
        variant: "4 Pack",
        sku: "SKU-A",
        merchandise: true,
        units: 12,
      },
      {
        period: "2026-07",
        product: "Bar",
        variant: "Single",
        sku: null,
        merchandise: true,
        units: 2,
      },
      {
        period: "2026-07",
        product: "Adjustment",
        variant: null,
        sku: null,
        merchandise: false,
        units: -1,
      },
    ] as const;
    const breakdown = buildProductUnitsBreakdown(context(), facts);
    const velocity = buildProductVelocityTable(context(), facts);
    expect(breakdown.metric.value).toEqual({ kind: "count", value: 14 });
    expect(breakdown.metric.warnings).toContain("NON_MERCHANDISE_ROWS_EXCLUDED");
    expect(breakdown.items.some(({ warnings }) => warnings.includes("MISSING_SKU"))).toBe(true);
    // Keys stay on the SKU identity; labels read as product names.
    expect(breakdown.items.map(({ key, label }) => [key, label])).toEqual([
      ["SKU-A", "Bar — 4 Pack"],
      ["UNMAPPED:Bar:Single", "Bar — Single"],
    ]);
    expect(velocity.rows).toHaveLength(2);
  });

  it("returns sanitized catalog/current inventory and deterministic missing-cost findings", () => {
    const catalog = [
      {
        productId: "product-1",
        productTitle: "Synthetic Bar",
        productStatus: "ACTIVE",
        variantId: "variant-1",
        variantTitle: "4 Pack",
        sku: "SKU-A",
        priceMinorUnits: 1200,
        activeOrSold: true,
        unitCostMinorUnits: null,
      },
    ] as const;
    const catalogTable = buildCatalogTable(context(), catalog);
    const missingCost = buildMissingCostMetric(context(), catalog);
    const inventory = buildInventoryBreakdown(context(), [
      {
        locationId: "location-1",
        locationName: "Synthetic Warehouse",
        product: "Synthetic Bar",
        variant: "4 Pack",
        sku: "SKU-A",
        quantityName: "available",
        quantity: 25,
        updatedAt: "2026-07-31T12:00:00.000Z",
      },
    ]);
    expect(catalogTable.rows[0]).not.toHaveProperty("unitCostMinorUnits");
    expect(missingCost.value).toEqual({ kind: "count", value: 1 });
    expect(missingCost.warnings).toContain("MISSING_COST:SKU-A");
    expect(inventory.metric.value).toEqual({ kind: "count", value: 25 });
    expect(inventory.metric.warnings).toContain("SHOPIFY_LOCATIONS_ONLY");
    expect(inventory.items[0]).toMatchObject({
      key: "location-1:SKU-A:available",
      label: "Synthetic Bar — 4 Pack · Available",
    });
  });

  it("keeps provider identifiers out of the catalog table", () => {
    const catalogTable = buildCatalogTable(context(), [
      {
        productId: "gid://shopify/Product/9418340958515",
        productTitle: "70% Cacao Dark Chocolate",
        productStatus: "ACTIVE",
        variantId: "gid://shopify/ProductVariant/49913834570035",
        variantTitle: "4-Pack",
        sku: "ZAC-DC-70-4PK",
        priceMinorUnits: 3600,
        activeOrSold: true,
        unitCostMinorUnits: 1800,
      },
    ]);
    expect(catalogTable.columns).toEqual([
      "product",
      "variant",
      "sku",
      "status",
      "priceMinorUnits",
    ]);
    expect(catalogTable.rows[0]).not.toHaveProperty("productId");
    expect(catalogTable.rows[0]).not.toHaveProperty("variantId");
    expect(catalogTable.rows[0]).toMatchObject({
      product: "70% Cacao Dark Chocolate",
      variant: "4-Pack",
      sku: "ZAC-DC-70-4PK",
    });
  });

  it("labels inventory groups by product and quantity state rather than location GID or SKU", () => {
    const fact = (sku: string | null, quantityName: string, quantity: number) => ({
      locationId: "gid://shopify/Location/111934701875",
      locationName: "Zacao Fulfillment",
      product: "70% Cacao Dark Chocolate",
      variant: "4-Pack",
      sku,
      quantityName,
      quantity,
      updatedAt: "2026-07-31T12:00:00.000Z",
    });
    const single = buildInventoryBreakdown(context(), [
      fact("ZAC-DC-70-4PK", "reserved", 2),
      { ...fact("ZAC-MC-42-10PK", "safety_stock", 58), product: "42% Cacao", variant: "10-Pack" },
      fact(null, "available", 4),
    ]);
    expect(single.items.map(({ label }) => label)).toEqual([
      "70% Cacao Dark Chocolate — 4-Pack · Reserved",
      "42% Cacao — 10-Pack · Safety stock",
      // An unmapped SKU still has a product title, so the label stays readable
      // and only the warning discloses the missing mapping.
      "70% Cacao Dark Chocolate — 4-Pack · Available",
    ]);
    // The grouping key still carries the location GID, so groups stay distinct.
    expect(single.items[0]?.key).toContain("gid://shopify/Location/111934701875");
    expect(single.items[2]?.warnings).toContain("MISSING_SKU");

    const multiple = buildInventoryBreakdown(context(), [
      fact("ZAC-DC-70-4PK", "available", 12),
      { ...fact("ZAC-DC-70-4PK", "available", 9), locationId: "loc-2", locationName: "Retail" },
    ]);
    expect(multiple.items.map(({ label }) => label)).toEqual([
      "Zacao Fulfillment · 70% Cacao Dark Chocolate — 4-Pack · Available",
      "Retail · 70% Cacao Dark Chocolate — 4-Pack · Available",
    ]);
  });
});

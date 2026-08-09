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
  });

  it("headlines available inventory only, because provider quantity states overlap", () => {
    // The audited SNAPL figures: summing every state reported 120, which
    // double-counted because on_hand already contains available and committed.
    const level = (quantityName: string, quantity: number) => ({
      locationId: "location-snapl",
      locationName: "SNAPL",
      sku: "ZAC-MC-42-10PK",
      quantityName,
      quantity,
      updatedAt: "2026-08-09T12:00:00.000Z",
    });
    const inventory = buildInventoryBreakdown(context(), [
      level("available", 56),
      level("committed", 4),
      level("on_hand", 60),
    ]);
    expect(inventory.metric.value).toEqual({ kind: "count", value: 56 });
    expect(inventory.metric.warnings).toContain("INVENTORY_AVAILABLE_STATE_ONLY");
    // Every state stays visible; only the headline is narrowed.
    expect(inventory.items).toHaveLength(3);
    expect(inventory.items.map(({ label }) => label)).toEqual([
      "SNAPL · ZAC-MC-42-10PK · available",
      "SNAPL · ZAC-MC-42-10PK · committed",
      "SNAPL · ZAC-MC-42-10PK · on_hand",
    ]);
  });

  it("labels unmapped inventory rows without leaking provider global ids", () => {
    const inventory = buildInventoryBreakdown(context(), [
      {
        locationId: "gid://shopify/Location/123",
        locationName: "SNAPL",
        sku: null,
        quantityName: "available",
        quantity: 7,
        updatedAt: "2026-08-09T12:00:00.000Z",
      },
    ]);
    expect(inventory.items[0]?.label).toBe("SNAPL · Unmapped SKU · available");
    expect(inventory.items[0]?.warnings).toContain("MISSING_SKU");
  });
});

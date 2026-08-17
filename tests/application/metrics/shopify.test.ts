import { describe, expect, it } from "vitest";

import {
  buildCatalogTable,
  buildCustomerClassificationMetrics,
  buildCustomerCityBreakdown,
  buildInventoryBreakdown,
  buildProductUnitsBreakdown,
  buildProductSkuVelocityBreakdown,
  buildProductVelocityTable,
  buildShopifyFunnelMetrics,
  buildShopifyFunnelTable,
  buildShopifySessionEngagementMetric,
} from "@/src/application/metrics";

import { context, source } from "./fixtures";

describe("B5 Shopify metric services", () => {
  it("uses provider customer classification and provider aggregate rate without identity inference", () => {
    // 4610 bp is deliberately NOT 40/(60+40) = 4000 bp, so a regression to the old
    // local division fails this assertion instead of coincidentally passing.
    const results = buildCustomerClassificationMetrics(
      context(),
      {
        rows: [
          { classification: "new", customers: 60 },
          { classification: "returning", customers: 40 },
          { classification: "unclassified", customers: 3 },
        ],
      },
      { returningRateBasisPoints: 4610, distinctCustomers: 100 },
    );
    expect(results.map(({ key, value }) => [key, value])).toEqual([
      ["customers.new_count", { kind: "count", value: 60 }],
      ["customers.returning_count", { kind: "count", value: 40 }],
      ["customers.returning_rate", { kind: "rate_basis_points", value: 4610 }],
    ]);
    expect(results[0]?.warnings).toContain("UNCLASSIFIED_CUSTOMER_ROWS");
    // 60 + 40 does not exceed 100 distinct, so no overlap is disclosed.
    expect(results[0]?.warnings).not.toContain("CUSTOMER_CLASSIFICATION_OVERLAP");
  });

  it("withholds the returning rate when the provider does not report one", () => {
    const [, , rate] = buildCustomerClassificationMetrics(
      context(),
      { rows: [{ classification: "returning", customers: 40 }] },
      { returningRateBasisPoints: null, distinctCustomers: 100 },
    );
    expect(rate?.value).toBeNull();
    expect(rate?.warnings).toContain("RETURNING_RATE_PROVIDER_UNAVAILABLE");
    expect(rate?.unavailableReason).toBe(
      "Shopify did not report returning_customer_rate for this period.",
    );
  });

  it("discloses classification overlap when the counts exceed the distinct total", () => {
    // 75 new + 47 returning = 122 against 110 distinct: 12 customers were both.
    const results = buildCustomerClassificationMetrics(
      context(),
      {
        rows: [
          { classification: "new", customers: 75 },
          { classification: "returning", customers: 47 },
        ],
      },
      { returningRateBasisPoints: 4610, distinctCustomers: 110 },
    );
    for (const result of results) {
      expect(result.warnings).toContain("CUSTOMER_CLASSIFICATION_OVERLAP");
    }
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

  it("publishes website sessions from the certified funnel fact", () => {
    const metrics = buildShopifyFunnelMetrics(context(), {
      sessions: 1280,
      visitors: 1100,
      cartAdditions: 174,
      reachedCheckout: 86,
      completedCheckout: 18,
      conversionRateBasisPoints: 141,
    });
    expect(metrics.map(({ key, value }) => [key, value])).toEqual([
      ["commerce.web_funnel", { kind: "rate_basis_points", value: 141 }],
      ["commerce.website_sessions", { kind: "count", value: 1280 }],
    ]);
  });

  it("publishes average time on site and PII-free city aggregates", () => {
    expect(
      buildShopifySessionEngagementMetric(context(), {
        averageSessionDurationSeconds: 192,
      }).value,
    ).toEqual({ kind: "duration_seconds", value: 192 });
    expect(buildShopifySessionEngagementMetric(context(), null).value).toBeNull();

    const city = buildCustomerCityBreakdown(context(), [
      { city: "New York", region: "NY", customers: 38 },
      { city: "Chicago", region: null, customers: 6 },
    ]);
    expect(city.metric.value).toEqual({ kind: "count", value: 44 });
    expect(city.items.map(({ label }) => label)).toEqual(["New York, NY", "Chicago"]);
    expect(city.metric.warnings).toContain("CITY_CUSTOMERS_MAY_OVERLAP");
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
    const skuVelocity = buildProductSkuVelocityBreakdown(context(), facts, 30);
    expect(breakdown.metric.value).toEqual({ kind: "count", value: 14 });
    expect(breakdown.metric.warnings).toContain("NON_MERCHANDISE_ROWS_EXCLUDED");
    expect(breakdown.items.some(({ warnings }) => warnings.includes("MISSING_SKU"))).toBe(true);
    expect(velocity.rows).toHaveLength(2);
    expect(skuVelocity.metric.value).toEqual({ kind: "quantity", value: 0.4 });
    expect(skuVelocity.items).toEqual([
      expect.objectContaining({
        key: "SKU-A",
        label: "Bar · SKU-A",
        values: [{ kind: "quantity", value: 0.4 }],
      }),
    ]);
  });

  it("sums pack-size variants into one product bar and discloses unattributed provider rows", () => {
    const facts = [
      {
        period: "2026-07",
        product: "42% Cacao Smooth Chocolate",
        variant: "10-Pack",
        sku: "ZAC-MC-42-10PK",
        merchandise: true,
        units: 13,
      },
      {
        period: "2026-07",
        product: "42% Cacao Smooth Chocolate",
        variant: "4-Pack",
        sku: "ZAC-MC-42-4PK",
        merchandise: true,
        units: 1,
      },
      {
        period: "2026-07",
        product: "70% Cacao Dark Chocolate",
        variant: "10-Pack",
        sku: "ZAC-DC-70-10PK",
        merchandise: true,
        units: 9,
      },
      {
        period: "2026-07",
        product: "(blank product)",
        variant: null,
        sku: null,
        merchandise: true,
        units: 12,
      },
    ] as const;
    const breakdown = buildProductUnitsBreakdown(context(), facts);
    expect(breakdown.dimension).toBe("product");
    expect(breakdown.items).toEqual([
      {
        key: "42% Cacao Smooth Chocolate",
        label: "42% Cacao Smooth Chocolate",
        values: [{ kind: "count", value: 14 }],
        warnings: [],
      },
      {
        key: "70% Cacao Dark Chocolate",
        label: "70% Cacao Dark Chocolate",
        values: [{ kind: "count", value: 9 }],
        warnings: [],
      },
      {
        key: "UNATTRIBUTED_PRODUCT",
        label: "Unattributed (no product record)",
        values: [{ kind: "count", value: 12 }],
        warnings: ["MISSING_SKU"],
      },
    ]);
    expect(breakdown.metric.value).toEqual({ kind: "count", value: 35 });
  });

  it("returns sanitized catalog/current inventory without treating Shopify cost as sheet authority", () => {
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
    const inventory = buildInventoryBreakdown(context(), [
      {
        locationId: "location-1",
        locationName: "Synthetic Warehouse",
        productTitle: "Synthetic Bar",
        variantTitle: "4 Pack",
        sku: "SKU-A",
        quantityName: "on_hand",
        quantity: 25,
        updatedAt: "2026-07-31T12:00:00.000Z",
      },
    ]);
    expect(catalogTable.rows[0]).not.toHaveProperty("unitCostMinorUnits");
    expect(inventory.metric.value).toEqual({ kind: "count", value: 25 });
    expect(inventory.metric.warnings).toContain("SHOPIFY_LOCATIONS_ONLY");
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

  it("uses only provider on-hand inventory and keeps provider identifiers out of labels", () => {
    const fact = (sku: string | null, quantityName: string, quantity: number) => ({
      locationId: "gid://shopify/Location/111934701875",
      locationName: "Zacao Fulfillment",
      productTitle: sku?.includes("MC") ? "42% Cacao Smooth Chocolate" : "70% Cacao Dark Chocolate",
      variantTitle: sku?.includes("10PK") ? "10-Pack" : "4-Pack",
      sku,
      quantityName,
      quantity,
      updatedAt: "2026-07-31T12:00:00.000Z",
    });
    const single = buildInventoryBreakdown(context(), [
      fact("ZAC-DC-70-4PK", "reserved", 2),
      fact("ZAC-MC-42-10PK", "on_hand", 58),
      fact(null, "on_hand", 4),
    ]);
    expect(single.items.map(({ label }) => label)).toEqual([
      "42% Cacao Smooth Chocolate · 10-Pack · On hand",
      "70% Cacao Dark Chocolate · 4-Pack · On hand",
    ]);
    // The grouping key still carries the location GID, so groups stay distinct.
    expect(single.items[0]?.key).toContain("gid://shopify/Location/111934701875");
    expect(single.items[1]?.warnings).toContain("MISSING_SKU");

    const multiple = buildInventoryBreakdown(context(), [
      fact("ZAC-DC-70-4PK", "on_hand", 12),
      { ...fact("ZAC-DC-70-4PK", "on_hand", 9), locationId: "loc-2", locationName: "Retail" },
    ]);
    expect(multiple.items.map(({ label }) => label)).toEqual([
      "Zacao Fulfillment · 70% Cacao Dark Chocolate · 4-Pack · On hand",
      "Retail · 70% Cacao Dark Chocolate · 4-Pack · On hand",
    ]);
  });
});

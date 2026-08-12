import { describe, expect, it } from "vitest";

import {
  mapCatalogVariantFacts,
  mapCustomerClassificationSummary,
  mapInventoryFacts,
  mapProductUnitsFacts,
  mapSalesTotalsFact,
  mapSalesTrendPoints,
  mapShopifyFunnelFact,
  parseShopifyQlCount,
  parseShopifyQlMoneyMinorUnits,
  parseShopifyQlRateBasisPoints,
} from "@/src/infrastructure/shopify/facts";
import { normalizeProduct } from "@/src/infrastructure/shopify/normalization";

// Row shapes mirror live 2026-07 ShopifyQL responses: objects keyed by column
// name with every value serialized as a decimal string.

describe("ShopifyQL value parsing (string arithmetic only)", () => {
  it("parses counts, money, and rates with provider-faithful rounding", () => {
    expect(parseShopifyQlCount("174")).toBe(174);
    expect(parseShopifyQlCount("-3")).toBe(-3);
    expect(parseShopifyQlMoneyMinorUnits("16153.54")).toBe(1_615_354);
    expect(parseShopifyQlMoneyMinorUnits("-12110.5")).toBe(-1_211_050);
    expect(parseShopifyQlMoneyMinorUnits("114.241")).toBe(11_424);
    expect(parseShopifyQlMoneyMinorUnits("114.245")).toBe(11_425);
    expect(parseShopifyQlRateBasisPoints("0.016666666666666666")).toBe(167);
    expect(parseShopifyQlRateBasisPoints("1")).toBe(10_000);
    expect(parseShopifyQlRateBasisPoints("0")).toBe(0);
  });

  it("rejects non-decimal values instead of guessing", () => {
    expect(() => parseShopifyQlCount("12,5")).toThrow(/plain decimal/);
    expect(() => parseShopifyQlMoneyMinorUnits("1e5")).toThrow(/plain decimal/);
    expect(() => parseShopifyQlCount(undefined)).toThrow();
  });
});

describe("customer classification summary", () => {
  it("classifies rows, computes the returning rate, and keeps blanks unclassified", () => {
    const summary = mapCustomerClassificationSummary([
      { new_or_returning_customer: "New", orders: "120", customers: "300" },
      { new_or_returning_customer: "Returning", orders: "54", customers: "100" },
      { new_or_returning_customer: "", orders: "2", customers: "5" },
    ]);
    expect(summary.rows).toEqual([
      { classification: "new", customers: 300 },
      { classification: "returning", customers: 100 },
      { classification: "unclassified", customers: 5 },
    ]);
    // 100 returning / 400 classified = 25.00%
    expect(summary.returningRateBasisPoints).toBe(2_500);
  });

  it("returns a null rate when no classified customers exist", () => {
    expect(mapCustomerClassificationSummary([]).returningRateBasisPoints).toBeNull();
  });

  it("throws when a required column is missing", () => {
    expect(() => mapCustomerClassificationSummary([{ customers: "10" }])).toThrow(
      /missing the required column/,
    );
  });
});

describe("web funnel fact", () => {
  it("sums monthly timeseries rows and derives the aggregate conversion rate", () => {
    const fact = mapShopifyFunnelFact([
      {
        month: "2026-06-01",
        sessions: "240",
        online_store_visitors: "197",
        sessions_with_cart_additions: "10",
        sessions_that_reached_checkout: "9",
        sessions_that_completed_checkout: "4",
        conversion_rate: "0.016666666666666666",
      },
      {
        month: "2026-07-01",
        sessions: "160",
        online_store_visitors: "120",
        sessions_with_cart_additions: "8",
        sessions_that_reached_checkout: "6",
        sessions_that_completed_checkout: "4",
        conversion_rate: "0.025",
      },
    ]);
    expect(fact).toEqual({
      sessions: 400,
      visitors: 317,
      cartAdditions: 18,
      reachedCheckout: 15,
      completedCheckout: 8,
      conversionRateBasisPoints: 200,
    });
  });

  it("returns null for an empty period or zero sessions", () => {
    expect(mapShopifyFunnelFact([])).toBeNull();
    expect(
      mapShopifyFunnelFact([
        {
          sessions: "0",
          online_store_visitors: "0",
          sessions_with_cart_additions: "0",
          sessions_that_reached_checkout: "0",
          sessions_that_completed_checkout: "0",
        },
      ]),
    ).toBeNull();
  });
});

describe("sales no-activity rows", () => {
  it("maps Shopify's fully empty aggregate row to no activity", () => {
    expect(
      mapSalesTotalsFact([
        {
          orders: "0",
          gross_sales: null,
          discounts: null,
          returns: null,
          net_sales: null,
          shipping_charges: null,
          taxes: null,
          total_sales: null,
          average_order_value: null,
        },
      ]),
    ).toBeNull();
    expect(mapSalesTrendPoints([{ month: null, net_sales: null }])).toEqual([]);
  });

  it("rejects partially null sales rows instead of hiding malformed data", () => {
    expect(() =>
      mapSalesTotalsFact([
        {
          orders: "2",
          gross_sales: null,
          discounts: "0",
          returns: "0",
          net_sales: "10",
          shipping_charges: "0",
          taxes: "0",
          total_sales: "10",
          average_order_value: "5",
        },
      ]),
    ).toThrow(/partially null/);
    expect(() => mapSalesTrendPoints([{ month: "2026-08-01", net_sales: null }])).toThrow(
      /partially null/,
    );
  });
});

describe("product units facts", () => {
  it("marks only line_type=product rows as merchandise and nulls blank SKUs", () => {
    const facts = mapProductUnitsFacts(
      [
        {
          line_type: "product",
          product_title: "70% Cacao Dark Chocolate",
          product_variant_title: "10-Pack",
          product_variant_sku: "ZAC-DC-70-10PK",
          net_sales: "6761.32",
          orders: "77",
          net_items_sold: "665",
        },
        {
          line_type: "adjustment",
          product_title: "",
          product_variant_title: null,
          product_variant_sku: "",
          net_sales: "-10.00",
          orders: "1",
          net_items_sold: "0",
        },
      ],
      "2025-08-08..2026-08-08",
    );
    expect(facts[0]).toEqual({
      period: "2025-08-08..2026-08-08",
      product: "70% Cacao Dark Chocolate",
      variant: "10-Pack",
      sku: "ZAC-DC-70-10PK",
      merchandise: true,
      units: 665,
    });
    expect(facts[1]).toMatchObject({
      product: "(blank product)",
      variant: null,
      sku: null,
      merchandise: false,
    });
  });
});

const providerProduct = {
  id: "gid://shopify/Product/1",
  title: "70% Cacao Dark Chocolate",
  handle: "70-cacao",
  status: "ACTIVE",
  variants: {
    nodes: [
      {
        id: "gid://shopify/ProductVariant/11",
        title: "10-Pack",
        sku: "ZAC-DC-70-10PK",
        price: "54.99",
        inventoryQuantity: 120,
        sellableOnlineQuantity: 118,
        inventoryItem: {
          id: "gid://shopify/InventoryItem/21",
          sku: "ZAC-DC-70-10PK",
          tracked: true,
          unitCost: { amount: "12.50", currencyCode: "USD" },
          inventoryLevels: {
            nodes: [
              {
                id: "gid://shopify/InventoryLevel/31",
                updatedAt: "2026-08-01T00:00:00Z",
                location: { id: "gid://shopify/Location/41", name: "SNAPL", isActive: true },
                quantities: [
                  { name: "available", quantity: 100 },
                  { name: "committed", quantity: 20 },
                ],
              },
            ],
          },
        },
      },
      {
        id: "gid://shopify/ProductVariant/12",
        title: "Single",
        sku: null,
        price: "6.99",
        inventoryQuantity: null,
        sellableOnlineQuantity: null,
        inventoryItem: {
          id: "gid://shopify/InventoryItem/22",
          sku: null,
          tracked: false,
          unitCost: null,
          inventoryLevels: { nodes: [] },
        },
      },
    ],
  },
};

describe("catalog and inventory facts from normalized admin products", () => {
  it("maps catalog variants with prices and cost completeness", () => {
    const facts = mapCatalogVariantFacts([normalizeProduct(providerProduct)]);
    expect(facts).toEqual([
      {
        productId: "gid://shopify/Product/1",
        productTitle: "70% Cacao Dark Chocolate",
        productStatus: "ACTIVE",
        variantId: "gid://shopify/ProductVariant/11",
        variantTitle: "10-Pack",
        sku: "ZAC-DC-70-10PK",
        priceMinorUnits: 5_499,
        activeOrSold: true,
        unitCostMinorUnits: 1_250,
      },
      {
        productId: "gid://shopify/Product/1",
        productTitle: "70% Cacao Dark Chocolate",
        productStatus: "ACTIVE",
        variantId: "gid://shopify/ProductVariant/12",
        variantTitle: "Single",
        sku: null,
        priceMinorUnits: 699,
        activeOrSold: true,
        unitCostMinorUnits: null,
      },
    ]);
  });

  it("maps tracked inventory levels into per-quantity facts and skips untracked variants", () => {
    const facts = mapInventoryFacts([normalizeProduct(providerProduct)]);
    expect(facts).toEqual([
      {
        locationId: "gid://shopify/Location/41",
        locationName: "SNAPL",
        productTitle: "70% Cacao Dark Chocolate",
        variantTitle: "10-Pack",
        sku: "ZAC-DC-70-10PK",
        quantityName: "available",
        quantity: 100,
        updatedAt: "2026-08-01T00:00:00Z",
      },
      {
        locationId: "gid://shopify/Location/41",
        locationName: "SNAPL",
        productTitle: "70% Cacao Dark Chocolate",
        variantTitle: "10-Pack",
        sku: "ZAC-DC-70-10PK",
        quantityName: "committed",
        quantity: 20,
        updatedAt: "2026-08-01T00:00:00Z",
      },
    ]);
  });
});

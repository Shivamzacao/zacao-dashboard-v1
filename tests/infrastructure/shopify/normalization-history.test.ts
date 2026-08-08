import { describe, expect, it } from "vitest";

import {
  buildShopifyHistory,
  normalizeInventoryLevel,
  normalizeOrder,
  normalizeProduct,
  normalizeShopifyChannel,
  normalizeShopifyMoney,
  ShopifyClientError,
  shopifyFailureStatus,
} from "@/src/infrastructure/shopify";

const moneySet = (amount: string) => ({ shopMoney: { amount, currencyCode: "USD" } });

describe("Shopify provider normalization", () => {
  it("normalizes USD precisely and leaves missing channels Unclassified", () => {
    expect(normalizeShopifyMoney({ amount: "20.90", currencyCode: "USD" })).toEqual({
      currency: "USD",
      minorUnits: 2_090,
    });
    expect(() => normalizeShopifyMoney({ amount: "20.90", currencyCode: "EUR" })).toThrow(
      /Unsupported/,
    );
    expect(normalizeShopifyChannel(" ")).toBe("Unclassified");
    expect(normalizeShopifyChannel(null)).toBe("Unclassified");
    expect(normalizeShopifyChannel("Faire: Sell Wholesale")).toBe("Faire: Sell Wholesale");
  });

  it("normalizes product/SKU/cost/inventory without inventing missing values", () => {
    const product = normalizeProduct({
      id: "gid://shopify/Product/1",
      title: "Dark Chocolate",
      handle: "dark-chocolate",
      status: "ACTIVE",
      variants: {
        nodes: [
          {
            id: "gid://shopify/ProductVariant/2",
            title: "4-Pack",
            sku: "ZAC-DC-70-4PK",
            price: "12.00",
            inventoryQuantity: 2,
            sellableOnlineQuantity: 0,
            inventoryItem: {
              id: "gid://shopify/InventoryItem/3",
              sku: "ZAC-DC-70-4PK",
              tracked: true,
              unitCost: null,
              inventoryLevels: {
                nodes: [
                  {
                    id: "gid://shopify/InventoryLevel/4",
                    updatedAt: "2026-08-06T12:00:00Z",
                    location: { id: "gid://shopify/Location/5", name: "SNAPL", isActive: true },
                    quantities: [
                      { name: "available", quantity: 0 },
                      { name: "committed", quantity: 2 },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    });
    expect(product.variants[0]?.inventoryItem?.unitCost).toBeNull();
    expect(product.variants[0]?.inventoryItem?.inventoryLevels[0]?.quantities).toEqual({
      available: 0,
      committed: 2,
    });
  });

  it("normalizes recent order/refund/fulfillment records without metric decisions", () => {
    const order = normalizeOrder({
      id: "gid://shopify/Order/1",
      name: "#1001",
      createdAt: "2026-08-01T12:00:00Z",
      processedAt: "2026-08-01T12:01:00Z",
      cancelledAt: null,
      test: false,
      currencyCode: "USD",
      sourceName: "",
      tags: [],
      displayFinancialStatus: "PAID",
      displayFulfillmentStatus: "FULFILLED",
      currentSubtotalPriceSet: moneySet("20.00"),
      currentTotalPriceSet: moneySet("21.50"),
      currentTotalDiscountsSet: moneySet("1.00"),
      currentShippingPriceSet: moneySet("2.00"),
      currentTotalTaxSet: moneySet("0.50"),
      totalRefundedSet: moneySet("4.00"),
      netPaymentSet: moneySet("17.50"),
      refunds: [
        {
          id: "gid://shopify/Refund/2",
          createdAt: "2026-08-03T12:00:00Z",
          totalRefundedSet: moneySet("4.00"),
        },
      ],
      fulfillments: [
        {
          id: "gid://shopify/Fulfillment/3",
          createdAt: "2026-08-02T12:00:00Z",
          updatedAt: "2026-08-04T12:00:00Z",
          status: "SUCCESS",
          displayStatus: "DELIVERED",
          deliveredAt: "2026-08-04T12:00:00Z",
          inTransitAt: null,
          estimatedDeliveryAt: null,
          location: { id: "gid://shopify/Location/4", name: "SNAPL" },
        },
      ],
    });
    expect(order.sourceName).toBe("Unclassified");
    expect(order.refunds[0]?.totalRefunded.minorUnits).toBe(400);
    expect(order.fulfillments[0]?.location?.name).toBe("SNAPL");
  });

  it("normalizes a standalone inventory level", () => {
    expect(
      normalizeInventoryLevel({
        id: "level-1",
        updatedAt: "2026-08-06T12:00:00Z",
        location: { id: "location-1", name: "SNAPL" },
        quantities: [{ name: "on_hand", quantity: 58 }],
      }).quantities,
    ).toEqual({ on_hand: 58 });
  });
});

describe("Shopify completeness and failure states", () => {
  it("keeps aggregate and detailed historical coverage distinct", () => {
    expect(
      buildShopifyHistory({
        mode: "aggregate",
        requestedStartDate: "2025-08-01",
        requestedEndDate: "2026-08-01",
        earliestDetailedRecordAt: null,
        hasReadAllOrders: false,
        detailedRangeVerified: false,
      }).completeness,
    ).toBe("complete");
    expect(
      buildShopifyHistory({
        mode: "detailed",
        requestedStartDate: "2025-08-01",
        requestedEndDate: "2026-08-01",
        earliestDetailedRecordAt: "2026-06-08T00:00:00Z",
        hasReadAllOrders: false,
        detailedRangeVerified: false,
      }),
    ).toMatchObject({
      completeness: "partial",
      warningCodes: ["SHOPIFY_DETAILED_HISTORY_PARTIAL"],
    });
  });

  it("maps connector failures to stable source readiness", () => {
    expect(
      shopifyFailureStatus(
        new ShopifyClientError("permission", "denied", false, "request-1"),
        "2026-08-06T12:00:00Z",
      ),
    ).toMatchObject({ state: "invalid", warningCodes: ["SHOPIFY_PERMISSION"] });
    expect(
      shopifyFailureStatus(
        new ShopifyClientError("timeout", "timeout", true, null),
        "2026-08-06T12:00:00Z",
      ),
    ).toMatchObject({ state: "unavailable", warningCodes: ["SHOPIFY_TIMEOUT"] });
  });
});

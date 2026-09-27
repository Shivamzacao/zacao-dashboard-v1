import { describe, expect, it, vi } from "vitest";

import { ShopifyClientError } from "@/src/infrastructure/shopify/client";
import { ShopifyCommerceReader } from "@/src/infrastructure/shopify/commerce-reader";
import { normalizeProduct } from "@/src/infrastructure/shopify/normalization";

const range = { startDate: "2026-09-27", endDate: "2026-09-27" };

const product = (hasNextPage: boolean) =>
  normalizeProduct({
    id: "gid://shopify/Product/1",
    title: "70% Cacao Dark Chocolate",
    handle: "dark",
    status: "ACTIVE",
    variants: {
      pageInfo: { hasNextPage: false },
      nodes: [
        {
          id: "gid://shopify/ProductVariant/1",
          title: "10-Pack",
          sku: "ZAC-DC-70-10PK",
          price: "85.00",
          inventoryQuantity: 374,
          sellableOnlineQuantity: 374,
          inventoryItem: {
            id: "gid://shopify/InventoryItem/1",
            sku: "ZAC-DC-70-10PK",
            tracked: true,
            unitCost: { amount: "20.70", currencyCode: "USD" },
            inventoryLevels: {
              pageInfo: { hasNextPage },
              nodes: [
                {
                  id: "gid://shopify/InventoryLevel/1",
                  updatedAt: "2026-09-27T10:00:00Z",
                  location: { id: "gid://shopify/Location/1", name: "SNAPL", isActive: true },
                  quantities: [
                    { name: "on_hand", quantity: 385 },
                    { name: "available", quantity: 374 },
                  ],
                },
              ],
            },
          },
        },
      ],
    },
  });

const empty = { records: [], truncated: false, history: {} };

describe("Shopify commerce reader", () => {
  it("keeps every Shopify identifier on canonical variants and positions", async () => {
    const reader = new ShopifyCommerceReader(
      {
        readProducts: vi.fn(async () => ({ ...empty, records: [product(false)] })),
        readLocations: vi.fn(),
        readOrders: vi.fn(),
      } as never,
      true,
    );
    const outcome = await reader.readCatalog(range);
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.truncated).toBe(false);
    expect(outcome.data.variants[0]).toMatchObject({
      productId: "gid://shopify/Product/1",
      variantId: "gid://shopify/ProductVariant/1",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      sku: "ZAC-DC-70-10PK",
    });
    expect(outcome.data.inventory[0]).toMatchObject({
      locationId: "gid://shopify/Location/1",
      quantities: { on_hand: 385, available: 374 },
    });
  });

  it("flags nested connection truncation instead of silently dropping levels", async () => {
    const reader = new ShopifyCommerceReader(
      {
        readProducts: vi.fn(async () => ({ ...empty, records: [product(true)] })),
        readLocations: vi.fn(),
        readOrders: vi.fn(),
      } as never,
      true,
    );
    const outcome = await reader.readCatalog(range);
    expect(outcome).toMatchObject({ status: "ok", truncated: true });
  });

  it("distinguishes no data, not authorized and failure", async () => {
    const reader = new ShopifyCommerceReader(
      {
        readProducts: vi.fn(async () => {
          throw new ShopifyClientError("permission", "Shopify returned HTTP 403", false, null);
        }),
        readLocations: vi.fn(async () => empty),
        readOrders: vi.fn(async () => {
          throw new ShopifyClientError("timeout", "Shopify request timed out", true, null);
        }),
      } as never,
      true,
    );
    await expect(reader.readCatalog(range)).resolves.toEqual({
      status: "not_authorized",
      reason: "SHOPIFY_PERMISSION",
    });
    await expect(reader.readLocations(range)).resolves.toEqual({ status: "no_data", data: [] });
    await expect(reader.readFulfillments(range)).resolves.toEqual({
      status: "failed",
      reason: "SHOPIFY_TIMEOUT",
      retryable: true,
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  canonicalVariantsFromProducts,
  VariantIdentityRegistry,
} from "@/src/infrastructure/shopify/catalog-identity";
import { classifyLineItem, normalizeLineItem } from "@/src/infrastructure/shopify/line-items";
import { normalizeOrder, normalizeProduct } from "@/src/infrastructure/shopify/normalization";

import { rawLineItem, rawOrder } from "./order-fixture";

const faireCommission = rawLineItem({
  id: "gid://shopify/LineItem/2",
  name: "Faire commission",
  sku: "FAIRE-COMMISSION",
  quantity: 1,
  currentQuantity: 1,
  product: null,
  variant: null,
});
const faireProcessing = rawLineItem({
  id: "gid://shopify/LineItem/3",
  name: "Faire payment processing fee",
  sku: "FAIRE-PAYMENT-PROCESSING-FEE",
  product: null,
  variant: null,
});

describe("Faire fee-line classification (C-4)", () => {
  it("classifies configured fee SKUs without a catalog binding as fees", () => {
    expect(normalizeLineItem(faireCommission)).toMatchObject({
      lineClass: "fee",
      feeCategory: "marketplace_commission",
    });
    expect(normalizeLineItem(faireProcessing)).toMatchObject({
      lineClass: "fee",
      feeCategory: "payment_processing_fee",
    });
  });

  it("never reclassifies a catalog-bound line as a fee", () => {
    expect(
      classifyLineItem({
        sku: "FAIRE-COMMISSION",
        product: { id: "gid://shopify/Product/1" },
        variant: null,
      }),
    ).toEqual({ lineClass: "product", feeCategory: null });
  });

  it("keeps unbound non-fee lines as custom rather than guessing", () => {
    expect(classifyLineItem({ sku: "REG-123", product: null, variant: null })).toEqual({
      lineClass: "custom",
      feeCategory: null,
    });
  });

  it("excludes fee lines from order units but leaves money fields untouched", () => {
    const order = normalizeOrder(
      rawOrder({
        sourceName: "faire",
        lineItems: {
          nodes: [
            rawLineItem({ currentQuantity: 2 }),
            rawLineItem({
              id: "gid://shopify/LineItem/9",
              sku: "ZAC-MC-42-10PK",
              currentQuantity: 2,
              variant: {
                id: "gid://shopify/ProductVariant/200",
                title: "10-Pack",
                sku: "ZAC-MC-42-10PK",
              },
            }),
            faireCommission,
            faireProcessing,
          ],
        },
      }),
    );
    expect(order.quantity).toBe(4);
    expect(order.lineItems?.filter(({ lineClass }) => lineClass === "fee")).toHaveLength(2);
    expect(order.subtotal.minorUnits).toBe(10_000);
    expect(order.total.minorUnits).toBe(11_000);
  });

  it("still distinguishes an unfetched line-item block from a zero-unit order", () => {
    expect(normalizeOrder(rawOrder()).quantity).toBeNull();
    expect(normalizeOrder(rawOrder()).lineItems).toBeNull();
    expect(normalizeOrder(rawOrder({ lineItems: { nodes: [] } })).quantity).toBe(0);
  });

  it("accepts legacy fixtures that carried only currentQuantity", () => {
    const order = normalizeOrder(rawOrder({ lineItems: { nodes: [{ currentQuantity: 3 }] } }));
    expect(order.quantity).toBe(3);
    expect(order.lineItems?.[0]).toMatchObject({ lineClass: "custom", skuSource: "none" });
  });
});

describe("historical SKU normalization (C-3)", () => {
  const catalog = new VariantIdentityRegistry(
    canonicalVariantsFromProducts([
      normalizeProduct({
        id: "gid://shopify/Product/10",
        title: "70% Cacao Dark Chocolate",
        handle: "dark",
        status: "ACTIVE",
        variants: {
          nodes: [
            {
              id: "gid://shopify/ProductVariant/100",
              title: "10-Pack",
              sku: "ZAC-DC-70-10PK",
              price: "85.00",
              inventoryQuantity: 374,
              sellableOnlineQuantity: 374,
              inventoryItem: null,
            },
          ],
        },
      }),
    ]),
  );

  it("resolves a legacy numeric line SKU to today's SKU through the variant GID", () => {
    // Older orders on this store carry numeric SKU snapshots (audit §21 C-3).
    const line = normalizeLineItem(
      rawLineItem({ sku: "49913834602803", variant: { id: "gid://shopify/ProductVariant/100" } }),
    );
    expect(line.lineSku).toBe("49913834602803");
    expect(catalog.resolveLine(line)).toEqual({
      variantId: "gid://shopify/ProductVariant/100",
      productId: "gid://shopify/Product/10",
      sku: "ZAC-DC-70-10PK",
      resolution: "catalog",
    });
  });

  it("prefers the variant's current SKU over the line snapshot when the catalog is not loaded", () => {
    const line = normalizeLineItem(
      rawLineItem({
        sku: "49913834602803",
        variant: { id: "gid://shopify/ProductVariant/999", sku: "ZAC-SS-80-10PK" },
      }),
    );
    expect(line).toMatchObject({ canonicalSku: "ZAC-SS-80-10PK", skuSource: "variant" });
    expect(catalog.resolveLine(line).resolution).toBe("variant_snapshot");
  });

  it("does not merge unbound lines into catalog variants by SKU text", () => {
    const line = normalizeLineItem(
      rawLineItem({ sku: "ZAC-DC-70-10PK", product: null, variant: null }),
    );
    expect(catalog.resolveLine(line)).toEqual({
      variantId: null,
      productId: null,
      sku: "ZAC-DC-70-10PK",
      resolution: "line_snapshot",
    });
  });
});

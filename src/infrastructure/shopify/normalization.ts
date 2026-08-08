import { z } from "zod";

import type { UsdMoney } from "@/src/domain/contracts/money";
import { parseUsdDecimal } from "@/src/domain/utilities/money";

const providerMoneySchema = z.object({ amount: z.string(), currencyCode: z.string() }).strict();
const providerMoneySetSchema = z.object({ shopMoney: providerMoneySchema }).strict();
const nullableInstant = z.string().datetime({ offset: true }).nullable();

export function normalizeShopifyId(value: unknown): string {
  return z.string().trim().min(1).parse(value);
}

export function normalizeShopifyInstant(value: unknown): string | null {
  return nullableInstant.parse(value);
}

export function normalizeShopifyMoney(value: unknown): UsdMoney {
  const money = providerMoneySchema.parse(value);
  if (money.currencyCode !== "USD") {
    throw new Error(`Unsupported Shopify currency: ${money.currencyCode}`);
  }
  return parseUsdDecimal(money.amount);
}

export function normalizeShopifyMoneySet(value: unknown): UsdMoney {
  return normalizeShopifyMoney(providerMoneySetSchema.parse(value).shopMoney);
}

export function normalizeShopifyChannel(value: unknown): string {
  const parsed = z.string().nullable().parse(value)?.trim();
  return parsed ? parsed : "Unclassified";
}

const providerInventoryLevelSchema = z.object({
  id: z.string(),
  updatedAt: z.string().datetime({ offset: true }),
  location: z.object({ id: z.string(), name: z.string(), isActive: z.boolean().optional() }),
  quantities: z.array(z.object({ name: z.string(), quantity: z.number().int() })),
});

export function normalizeInventoryLevel(value: unknown) {
  const level = providerInventoryLevelSchema.parse(value);
  return {
    id: normalizeShopifyId(level.id),
    updatedAt: level.updatedAt,
    location: {
      id: normalizeShopifyId(level.location.id),
      name: level.location.name,
      isActive: level.location.isActive ?? true,
    },
    quantities: Object.fromEntries(
      level.quantities.map((quantity) => [quantity.name, quantity.quantity]),
    ),
  } as const;
}

const providerVariantSchema = z.object({
  id: z.string(),
  title: z.string(),
  sku: z.string().nullable(),
  price: z.string(),
  inventoryQuantity: z.number().int().nullable(),
  sellableOnlineQuantity: z.number().int().nullable(),
  inventoryItem: z
    .object({
      id: z.string(),
      sku: z.string().nullable(),
      tracked: z.boolean(),
      unitCost: providerMoneySchema.nullable(),
      inventoryLevels: z.object({ nodes: z.array(providerInventoryLevelSchema) }),
    })
    .nullable(),
});

const providerProductSchema = z.object({
  id: z.string(),
  title: z.string(),
  handle: z.string(),
  status: z.string(),
  variants: z.object({ nodes: z.array(providerVariantSchema) }),
});

export function normalizeProduct(value: unknown) {
  const product = providerProductSchema.parse(value);
  return {
    id: normalizeShopifyId(product.id),
    title: product.title,
    handle: product.handle,
    status: product.status,
    variants: product.variants.nodes.map((variant) => ({
      id: normalizeShopifyId(variant.id),
      title: variant.title,
      sku: variant.sku?.trim() || null,
      price: normalizeShopifyMoney({ amount: variant.price, currencyCode: "USD" }),
      inventoryQuantity: variant.inventoryQuantity,
      sellableOnlineQuantity: variant.sellableOnlineQuantity,
      inventoryItem: variant.inventoryItem
        ? {
            id: normalizeShopifyId(variant.inventoryItem.id),
            sku: variant.inventoryItem.sku?.trim() || null,
            tracked: variant.inventoryItem.tracked,
            unitCost: variant.inventoryItem.unitCost
              ? normalizeShopifyMoney(variant.inventoryItem.unitCost)
              : null,
            inventoryLevels:
              variant.inventoryItem.inventoryLevels.nodes.map(normalizeInventoryLevel),
          }
        : null,
    })),
  } as const;
}

const providerRefundSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  totalRefundedSet: providerMoneySetSchema,
});
const providerFulfillmentSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  status: z.string(),
  displayStatus: z.string().nullable(),
  deliveredAt: nullableInstant,
  inTransitAt: nullableInstant,
  estimatedDeliveryAt: nullableInstant,
  location: z.object({ id: z.string().min(1), name: z.string() }).nullable(),
});
const providerOrderSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  processedAt: nullableInstant,
  cancelledAt: nullableInstant,
  test: z.boolean(),
  currencyCode: z.string(),
  sourceName: z.string().nullable(),
  tags: z.array(z.string()),
  displayFinancialStatus: z.string().nullable(),
  displayFulfillmentStatus: z.string().nullable(),
  currentSubtotalPriceSet: providerMoneySetSchema,
  currentTotalPriceSet: providerMoneySetSchema,
  currentTotalDiscountsSet: providerMoneySetSchema,
  currentShippingPriceSet: providerMoneySetSchema,
  currentTotalTaxSet: providerMoneySetSchema,
  totalRefundedSet: providerMoneySetSchema,
  netPaymentSet: providerMoneySetSchema,
  refunds: z.array(providerRefundSchema),
  fulfillments: z.array(providerFulfillmentSchema),
});

export function normalizeOrder(value: unknown) {
  const order = providerOrderSchema.parse(value);
  if (order.currencyCode !== "USD") {
    throw new Error(`Unsupported Shopify order currency: ${order.currencyCode}`);
  }
  return {
    id: normalizeShopifyId(order.id),
    name: order.name,
    createdAt: order.createdAt,
    processedAt: order.processedAt,
    cancelledAt: order.cancelledAt,
    test: order.test,
    sourceName: normalizeShopifyChannel(order.sourceName),
    tags: order.tags,
    financialStatus: order.displayFinancialStatus,
    fulfillmentStatus: order.displayFulfillmentStatus,
    subtotal: normalizeShopifyMoneySet(order.currentSubtotalPriceSet),
    total: normalizeShopifyMoneySet(order.currentTotalPriceSet),
    discounts: normalizeShopifyMoneySet(order.currentTotalDiscountsSet),
    shipping: normalizeShopifyMoneySet(order.currentShippingPriceSet),
    taxes: normalizeShopifyMoneySet(order.currentTotalTaxSet),
    refunded: normalizeShopifyMoneySet(order.totalRefundedSet),
    netPayment: normalizeShopifyMoneySet(order.netPaymentSet),
    refunds: order.refunds.map((refund) => ({
      id: normalizeShopifyId(refund.id),
      createdAt: refund.createdAt,
      totalRefunded: normalizeShopifyMoneySet(refund.totalRefundedSet),
    })),
    fulfillments: order.fulfillments.map((fulfillment) => ({
      id: normalizeShopifyId(fulfillment.id),
      createdAt: fulfillment.createdAt,
      updatedAt: fulfillment.updatedAt,
      status: fulfillment.status,
      displayStatus: fulfillment.displayStatus,
      deliveredAt: fulfillment.deliveredAt,
      inTransitAt: fulfillment.inTransitAt,
      estimatedDeliveryAt: fulfillment.estimatedDeliveryAt,
      location: fulfillment.location
        ? { id: normalizeShopifyId(fulfillment.location.id), name: fulfillment.location.name }
        : null,
    })),
  } as const;
}

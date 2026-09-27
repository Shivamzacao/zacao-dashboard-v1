import { z } from "zod";

import type { FeeLineCategory } from "@/src/domain/configuration/business-config";
import type { UsdMoney } from "@/src/domain/contracts/money";
import { parseUsdDecimal } from "@/src/domain/utilities/money";
import { businessConfiguration } from "@/src/infrastructure/config/business-config";

const moneySetSchema = z.object({
  shopMoney: z.object({ amount: z.string(), currencyCode: z.string() }).strict(),
});

/**
 * Line item as ORDERS_QUERY requests it. Every field except `currentQuantity`
 * is optional: older fixtures carried only quantities, and a partially
 * selected payload must still normalize rather than throw.
 */
export const providerLineItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().nullable().optional(),
  quantity: z.number().int().nonnegative().optional(),
  currentQuantity: z.number().int().nonnegative(),
  sku: z.string().nullable().optional(),
  product: z
    .object({ id: z.string(), title: z.string().nullable().optional() })
    .nullable()
    .optional(),
  variant: z
    .object({
      id: z.string(),
      title: z.string().nullable().optional(),
      sku: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  originalUnitPriceSet: moneySetSchema.optional(),
  discountedUnitPriceSet: moneySetSchema.optional(),
});

export type ProviderLineItem = z.infer<typeof providerLineItemSchema>;

/**
 * - `product`: bound to a catalog product/variant — a unit of merchandise.
 * - `fee`: a configured non-merchandise charge line (e.g. Faire commission).
 *   Never a unit of product sold.
 * - `custom`: a line with no catalog binding that is not a configured fee
 *   (custom draft-order items, legacy lines whose variant was deleted). Counted
 *   exactly as before this layer existed; it is not reclassified by guesswork.
 */
export type LineItemClass = "product" | "fee" | "custom";

/**
 * Where the canonical SKU came from. `variant` is the variant's *current* SKU;
 * `line_item` is the SKU snapshot stored on the order line, which on this
 * store's older orders is a numeric legacy value rather than today's SKU.
 */
export type SkuSource = "variant" | "line_item" | "none";

export interface NormalizedLineItem {
  readonly id: string | null;
  readonly name: string | null;
  readonly quantity: number | null;
  readonly currentQuantity: number;
  readonly lineClass: LineItemClass;
  readonly feeCategory: FeeLineCategory | null;
  /** Stable join key: the variant GID when bound, else null. Never a SKU string. */
  readonly variantId: string | null;
  readonly productId: string | null;
  readonly canonicalSku: string | null;
  readonly skuSource: SkuSource;
  /** The raw SKU snapshot on the line, kept for reconciliation and audit. */
  readonly lineSku: string | null;
  readonly originalUnitPrice: UsdMoney | null;
  readonly discountedUnitPrice: UsdMoney | null;
}

const feeSkus: ReadonlyMap<string, FeeLineCategory> = new Map(
  businessConfiguration.lineItemClassification.feeSkus.map((entry) => [
    entry.sku.toUpperCase(),
    entry.category,
  ]),
);

const clean = (value: string | null | undefined): string | null => value?.trim() || null;

const gid = (value: string): string => z.string().trim().min(1).parse(value);

function usd(set: z.infer<typeof moneySetSchema>): UsdMoney {
  if (set.shopMoney.currencyCode !== "USD") {
    throw new Error(`Unsupported Shopify currency: ${set.shopMoney.currencyCode}`);
  }
  return parseUsdDecimal(set.shopMoney.amount);
}

export function classifyLineItem(
  item: Pick<ProviderLineItem, "sku" | "product" | "variant">,
  configuredFees: ReadonlyMap<string, FeeLineCategory> = feeSkus,
): { readonly lineClass: LineItemClass; readonly feeCategory: FeeLineCategory | null } {
  const bound = Boolean(item.variant ?? item.product);
  const sku = clean(item.sku)?.toUpperCase();
  // A catalog-bound line is merchandise even if its SKU collides with a fee
  // code; fee lines on this store carry no product and no variant.
  if (!bound && sku && configuredFees.has(sku)) {
    return { lineClass: "fee", feeCategory: configuredFees.get(sku) ?? null };
  }
  return { lineClass: bound ? "product" : "custom", feeCategory: null };
}

export function normalizeLineItem(value: unknown): NormalizedLineItem {
  const item = providerLineItemSchema.parse(value);
  const { lineClass, feeCategory } = classifyLineItem(item);
  const variantSku = clean(item.variant?.sku);
  const lineSku = clean(item.sku);
  const canonicalSku = variantSku ?? lineSku;
  return {
    id: item.id ? gid(item.id) : null,
    name: clean(item.name),
    quantity: item.quantity ?? null,
    currentQuantity: item.currentQuantity,
    lineClass,
    feeCategory,
    variantId: item.variant ? gid(item.variant.id) : null,
    productId: item.product ? gid(item.product.id) : null,
    canonicalSku,
    skuSource: variantSku ? "variant" : lineSku ? "line_item" : "none",
    lineSku,
    originalUnitPrice: item.originalUnitPriceSet ? usd(item.originalUnitPriceSet) : null,
    discountedUnitPrice: item.discountedUnitPriceSet ? usd(item.discountedUnitPriceSet) : null,
  };
}

/** Units of merchandise on the order: every line except configured fee lines. */
export function merchandiseQuantity(items: readonly NormalizedLineItem[]): number {
  return items
    .filter(({ lineClass }) => lineClass !== "fee")
    .reduce((total, item) => total + item.currentQuantity, 0);
}

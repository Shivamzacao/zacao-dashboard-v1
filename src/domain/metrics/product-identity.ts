/**
 * Shopify returns merchandise rows it cannot trace back to a catalog product
 * with a null product_title and product_variant_sku — observed on Faire
 * wholesale lines whose items carry no Shopify product reference. The fact
 * mappers stamp this placeholder so fact titles stay non-nullable, and metric
 * builders detect it to disclose those rows as unattributed instead of inventing
 * a product name or exposing an internal grouping key to the reader.
 */
export const BLANK_PRODUCT_TITLE = "(blank product)";

export const UNATTRIBUTED_PRODUCT_KEY = "UNATTRIBUTED_PRODUCT";

/** Grouping-key prefix for variant-grained rows the provider left without a SKU. */
export const UNMAPPED_KEY_PREFIX = "UNMAPPED:";

export function isUnmappedProductKey(key: string): boolean {
  return key.startsWith(UNMAPPED_KEY_PREFIX);
}

export const UNATTRIBUTED_PRODUCT_LABEL = "Unattributed (no product record)";

export function isAttributedProduct(fact: { readonly product: string }): boolean {
  return fact.product !== BLANK_PRODUCT_TITLE && fact.product.trim() !== "";
}

/**
 * Reader-facing name for a variant-grained row: one catalog product covers
 * several pack sizes, so the variant has to travel with the product name or two
 * rows of the same product become indistinguishable.
 */
export function productVariantLabel(fact: {
  readonly product: string;
  readonly variant: string | null;
}): string {
  if (!isAttributedProduct(fact)) return UNATTRIBUTED_PRODUCT_LABEL;
  return fact.variant ? `${fact.product} · ${fact.variant}` : fact.product;
}

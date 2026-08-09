/**
 * Product breakdowns group on the SKU because that is the stable provider
 * identity, but a SKU is not what a reader recognizes. Keys stay machine-facing;
 * labels carry the product name the provider reports alongside it.
 */
export interface ProductIdentity {
  readonly product: string;
  readonly variant: string | null;
  readonly sku: string | null;
}

/** Shopify's placeholder variant title on single-variant products. */
const PLACEHOLDER_VARIANT_TITLE = "default title";

export function productBreakdownKey({ product, variant, sku }: ProductIdentity): string {
  return sku ?? `UNMAPPED:${product}:${variant ?? ""}`;
}

/** The product name, qualified by variant only when the variant adds meaning. */
export function productDisplayLabel({ product, variant }: Omit<ProductIdentity, "sku">): string {
  const qualifier = variant?.trim();
  if (!qualifier || qualifier.toLowerCase() === PLACEHOLDER_VARIANT_TITLE) return product;
  return `${product} — ${qualifier}`;
}

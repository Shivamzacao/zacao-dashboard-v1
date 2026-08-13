/**
 * Labels for SKU-dimension breakdowns.
 *
 * ShopifyQL returns one row per variant, so a product with several variants
 * (e.g. `ZAC-DC-70-4PK` and `ZAC-DC-70-10PK`) yields several SKU groups sharing
 * one `product_title`. Labelling those groups with the product title alone
 * renders as duplicate bars, so the variant qualifies the label — and the SKU
 * itself qualifies it when the variant title is shared too.
 */

/** Shopify's placeholder variant titles for single-variant products. */
const PLACEHOLDER_VARIANT_TITLES = new Set(["default title", "default"]);

/**
 * Shopify returns merchandise rows it cannot trace back to a catalog product
 * with a null product_title and product_variant_sku — observed on Faire
 * wholesale lines whose items carry no Shopify product reference. The fact
 * mappers stamp this placeholder so fact titles stay non-nullable, and the
 * labels below turn it into reader-facing copy instead of exposing an internal
 * grouping key. The MISSING_SKU warning still discloses the gap.
 */
export const BLANK_PRODUCT_TITLE = "(blank product)";

export const UNATTRIBUTED_PRODUCT_KEY = "UNATTRIBUTED_PRODUCT";

export const UNATTRIBUTED_PRODUCT_LABEL = "Unattributed (no product record)";

export interface SkuGroupIdentity {
  readonly product: string;
  readonly variant: string | null;
}

export function isAttributedProduct(identity: { readonly product: string }): boolean {
  return identity.product !== BLANK_PRODUCT_TITLE && identity.product.trim() !== "";
}

export function skuGroupKey(identity: SkuGroupIdentity & { readonly sku: string | null }): string {
  return identity.sku ?? `UNMAPPED:${identity.product}:${identity.variant ?? ""}`;
}

export function isUnmappedSkuKey(key: string): boolean {
  return key.startsWith("UNMAPPED:");
}

function variantQualifiedLabel({ product, variant }: SkuGroupIdentity): string {
  if (!isAttributedProduct({ product })) return UNATTRIBUTED_PRODUCT_LABEL;
  const trimmed = variant?.trim();
  if (!trimmed || PLACEHOLDER_VARIANT_TITLES.has(trimmed.toLowerCase())) return product;
  return `${product} · ${trimmed}`;
}

/** Distinct label per SKU group, keyed by the group key from {@link skuGroupKey}. */
export function buildSkuGroupLabels(
  groups: Iterable<readonly [string, SkuGroupIdentity]>,
): Map<string, string> {
  const entries = [...groups];
  const labelCounts = new Map<string, number>();
  for (const [, identity] of entries) {
    const label = variantQualifiedLabel(identity);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  return new Map(
    entries.map(([key, identity]) => {
      const label = variantQualifiedLabel(identity);
      if ((labelCounts.get(label) ?? 0) === 1) return [key, label];
      // Variants that share a title (or blank titles) still need separating —
      // by SKU where there is one, and otherwise by the missing-SKU fact, since
      // the grouping key itself is not reader-facing copy.
      return [key, isUnmappedSkuKey(key) ? `${label} · no SKU` : `${label} · ${key}`];
    }),
  );
}

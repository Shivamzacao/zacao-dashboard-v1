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

export interface SkuGroupIdentity {
  readonly product: string;
  readonly variant: string | null;
}

export function skuGroupKey(identity: SkuGroupIdentity & { readonly sku: string | null }): string {
  return identity.sku ?? `UNMAPPED:${identity.product}:${identity.variant ?? ""}`;
}

export function isUnmappedSkuKey(key: string): boolean {
  return key.startsWith("UNMAPPED:");
}

function variantQualifiedLabel({ product, variant }: SkuGroupIdentity): string {
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
  for (const [key, identity] of entries) {
    if (isUnmappedSkuKey(key)) continue;
    const label = variantQualifiedLabel(identity);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  return new Map(
    entries.map(([key, identity]) => {
      if (isUnmappedSkuKey(key)) return [key, key];
      const label = variantQualifiedLabel(identity);
      // Variants that share a title (or blank titles) still need separating.
      return [key, (labelCounts.get(label) ?? 0) > 1 ? `${label} · ${key}` : label];
    }),
  );
}

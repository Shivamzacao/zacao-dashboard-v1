/**
 * Pack-variant resolution.
 *
 * SKU_Master maps one Shopify variant per canonical SKU — in practice the
 * four-pack — while the store also stocks other pack sizes of the same product
 * (`ZAC-MC-42-4PK` is mapped; `ZAC-MC-42-10PK` is not). Treating the unmapped
 * variant as unknown silently drops its whole inventory, which is how 580 bars
 * went missing from a total.
 *
 * The rule is deliberately conservative: the family prefix must resolve to
 * exactly one canonical SKU, and the pack size comes from the variant's own
 * suffix rather than the sibling's. Ambiguity stays unresolved instead of
 * guessing, and an explicit mapping always wins over a derived one.
 */

const PACK_VARIANT_SKU = /^(.+)-(\d+)PK$/i;

export interface PackVariantMatch {
  /** The sibling variant's mapping key, so callers can look up its canonical SKU. */
  readonly siblingShopifySku: string;
  /** Pack size parsed from the requested variant, not inherited from the sibling. */
  readonly packSizeBars: number;
}

/**
 * Resolves an unmapped `<family>-<n>PK` variant through an explicitly mapped
 * sibling. Returns null when the SKU is not a pack variant, or when its family
 * maps to zero or several canonical SKUs.
 */
export function resolvePackVariantSibling(
  shopifySku: string,
  mappedShopifySkus: Iterable<string>,
  canonicalSkuFor: (shopifySku: string) => string | null,
): PackVariantMatch | null {
  const match = PACK_VARIANT_SKU.exec(shopifySku);
  const family = match?.[1];
  const packSizeBars = Number(match?.[2]);
  if (!family || !Number.isInteger(packSizeBars) || packSizeBars <= 0) return null;

  const siblings = new Map<string, string>();
  for (const candidate of mappedShopifySkus) {
    if (PACK_VARIANT_SKU.exec(candidate)?.[1]?.toLowerCase() !== family.toLowerCase()) continue;
    const canonical = canonicalSkuFor(candidate);
    if (canonical) siblings.set(canonical, candidate);
  }
  if (siblings.size !== 1) return null;
  const siblingShopifySku = [...siblings.values()][0];
  return siblingShopifySku ? { siblingShopifySku, packSizeBars } : null;
}

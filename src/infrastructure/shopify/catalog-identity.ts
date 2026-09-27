import type { CanonicalOrderLineIdentity, CanonicalVariant } from "@/src/domain/commerce/models";

import type { NormalizedLineItem } from "./line-items";
import type { normalizeProduct } from "./normalization";

type NormalizedProduct = ReturnType<typeof normalizeProduct>;

/** Canonical variants from normalized Shopify products, GIDs preserved. */
export function canonicalVariantsFromProducts(
  products: readonly NormalizedProduct[],
): readonly CanonicalVariant[] {
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      source: "shopify" as const,
      productId: product.id,
      variantId: variant.id,
      inventoryItemId: variant.inventoryItem?.id ?? null,
      sku: variant.sku,
      productTitle: product.title,
      variantTitle: variant.title,
      productStatus: product.status,
      tracked: variant.inventoryItem?.tracked ?? null,
    })),
  );
}

/**
 * Resolves order lines to a stable identity (C-3). The variant GID is the join
 * key; the SKU string is only ever an attribute. A historical line whose SKU
 * snapshot is a legacy value still resolves to today's SKU through its
 * variant, and two lines are never merged merely because their SKU text
 * matches.
 */
export class VariantIdentityRegistry {
  private readonly byVariantId: ReadonlyMap<string, CanonicalVariant>;

  constructor(variants: readonly CanonicalVariant[]) {
    this.byVariantId = new Map(variants.map((variant) => [variant.variantId, variant]));
  }

  variant(variantId: string): CanonicalVariant | undefined {
    return this.byVariantId.get(variantId);
  }

  resolveLine(
    line: Pick<NormalizedLineItem, "variantId" | "productId" | "canonicalSku" | "skuSource">,
  ): CanonicalOrderLineIdentity {
    if (line.variantId) {
      const known = this.byVariantId.get(line.variantId);
      if (known) {
        return {
          variantId: known.variantId,
          productId: known.productId,
          sku: known.sku,
          resolution: "catalog",
        };
      }
    }
    return {
      variantId: line.variantId,
      productId: line.productId,
      sku: line.canonicalSku,
      resolution:
        line.skuSource === "variant"
          ? "variant_snapshot"
          : line.skuSource === "line_item"
            ? "line_snapshot"
            : "unresolved",
    };
  }
}

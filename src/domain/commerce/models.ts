/**
 * Canonical commerce models: the source-independent shape the migration
 * adapters produce. Every model keeps the provider identifiers it came from —
 * normalization must never discard a Shopify GID, because GIDs (not SKU
 * strings) are the only stable join keys across a store's history.
 */

export type CommerceSource = "shopify" | "google_sheets" | "internal";

/** A sellable variant with every identifier needed to join old and new data. */
export interface CanonicalVariant {
  readonly source: CommerceSource;
  readonly productId: string;
  readonly variantId: string;
  readonly inventoryItemId: string | null;
  /** The variant's current SKU. Historical order lines may carry another value. */
  readonly sku: string | null;
  readonly productTitle: string;
  readonly variantTitle: string;
  readonly productStatus: string;
  readonly tracked: boolean | null;
}

export interface CanonicalLocation {
  readonly source: CommerceSource;
  readonly locationId: string;
  readonly name: string;
  readonly isActive: boolean;
  /** Whether the location currently holds stock; null when not reported. */
  readonly hasActiveInventory: boolean | null;
  readonly shipsInventory: boolean | null;
  readonly fulfillsOnlineOrders: boolean | null;
}

/** Named inventory quantities exactly as the provider reports them. */
export interface CanonicalInventoryPosition {
  readonly source: CommerceSource;
  readonly variantId: string | null;
  readonly inventoryItemId: string;
  readonly sku: string | null;
  readonly locationId: string;
  readonly locationName: string;
  /** Provider timestamp of the level, or the read time when none is given. */
  readonly asOf: string;
  readonly quantities: Readonly<Record<string, number>>;
}

export interface CanonicalFulfillment {
  readonly source: CommerceSource;
  readonly fulfillmentId: string;
  readonly orderId: string;
  /** Merchant-facing order name (e.g. "#1001"); sheets usually key orders by it. */
  readonly orderName: string;
  readonly orderCreatedAt: string;
  readonly createdAt: string;
  readonly inTransitAt: string | null;
  readonly deliveredAt: string | null;
  readonly estimatedDeliveryAt: string | null;
  readonly status: string;
  readonly displayStatus: string | null;
  readonly locationId: string | null;
  readonly locationName: string | null;
}

/**
 * How a canonical order line's SKU was resolved:
 * - `catalog`: the line's variant GID matched the current catalog; SKU is today's.
 * - `variant_snapshot`: the variant GID is present but not in the loaded catalog;
 *   SKU is the variant SKU echoed on the order.
 * - `line_snapshot`: no variant binding; SKU is the historical line snapshot.
 * - `unresolved`: no SKU at all.
 */
export type SkuResolution = "catalog" | "variant_snapshot" | "line_snapshot" | "unresolved";

export interface CanonicalOrderLineIdentity {
  readonly variantId: string | null;
  readonly productId: string | null;
  readonly sku: string | null;
  readonly resolution: SkuResolution;
}

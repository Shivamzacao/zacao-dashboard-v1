import type {
  CanonicalFulfillment,
  CanonicalInventoryPosition,
  CanonicalLocation,
  CanonicalVariant,
} from "@/src/domain/commerce/models";
import type { DateRange } from "@/src/domain/contracts/date-range";
import type { SourceReadOutcome } from "@/src/domain/sources/read-outcome";

import { paddedCreatedAtWindow, type ShopifyAdminAdapter } from "./admin-graphql/adapter";
import { canonicalVariantsFromProducts } from "./catalog-identity";
import { ShopifyClientError } from "./client";

type AdminReads = Pick<ShopifyAdminAdapter, "readProducts" | "readLocations" | "readOrders">;

export interface ShopifyCatalogSnapshot {
  readonly variants: readonly CanonicalVariant[];
  readonly inventory: readonly CanonicalInventoryPosition[];
}

/** Maps a thrown read failure onto a named outcome instead of an empty result. */
export function shopifyFailureOutcome(error: unknown): SourceReadOutcome<never> {
  if (error instanceof ShopifyClientError) {
    if (error.kind === "authentication" || error.kind === "permission") {
      return { status: "not_authorized", reason: `SHOPIFY_${error.kind.toUpperCase()}` };
    }
    return {
      status: "failed",
      reason: `SHOPIFY_${error.kind.toUpperCase()}`,
      retryable: error.retryable,
    };
  }
  return { status: "failed", reason: "SHOPIFY_UNEXPECTED_ERROR", retryable: false };
}

async function outcome<T>(
  read: () => Promise<{ readonly data: T; readonly truncated: boolean; readonly empty: boolean }>,
): Promise<SourceReadOutcome<T>> {
  try {
    const { data, truncated, empty } = await read();
    return empty && !truncated ? { status: "no_data", data } : { status: "ok", data, truncated };
  } catch (error) {
    return shopifyFailureOutcome(error);
  }
}

/**
 * Normalized, source-independent reads of the Shopify data that replaces
 * spreadsheet lookups: variants (SKU_Master identity), locations
 * (Location_Master), inventory positions (the Shopify-mirrored part of
 * Inventory_Snapshots) and fulfillments (Warehouse_Fulfillment timing).
 *
 * One catalog read serves both variants and inventory, so a parity run or an
 * API-mode page never issues the products query twice.
 */
export class ShopifyCommerceReader {
  constructor(
    private readonly admin: AdminReads,
    private readonly hasReadAllOrders: boolean,
    private readonly now: () => Date = () => new Date(),
  ) {}

  readCatalog(dateRange: DateRange): Promise<SourceReadOutcome<ShopifyCatalogSnapshot>> {
    return outcome(async () => {
      const result = await this.admin.readProducts({
        dateRange,
        hasReadAllOrders: this.hasReadAllOrders,
      });
      const readAt = this.now().toISOString();
      const variants = canonicalVariantsFromProducts(result.records);
      const inventory = result.records.flatMap((product) =>
        product.variants.flatMap((variant) =>
          (variant.inventoryItem?.inventoryLevels ?? []).map(
            (level): CanonicalInventoryPosition => ({
              source: "shopify",
              variantId: variant.id,
              inventoryItemId: variant.inventoryItem?.id ?? level.id,
              sku: variant.sku,
              locationId: level.location.id,
              locationName: level.location.name,
              asOf: level.updatedAt || readAt,
              quantities: level.quantities,
            }),
          ),
        ),
      );
      return {
        data: { variants, inventory },
        truncated: result.truncated || result.records.some((product) => product.nestedTruncated),
        empty: variants.length === 0,
      };
    });
  }

  readLocations(dateRange: DateRange): Promise<SourceReadOutcome<readonly CanonicalLocation[]>> {
    return outcome(async () => {
      const result = await this.admin.readLocations({
        dateRange,
        hasReadAllOrders: this.hasReadAllOrders,
      });
      const data = result.records.map((location): CanonicalLocation => ({
        source: "shopify",
        locationId: location.id,
        name: location.name,
        isActive: location.isActive,
        hasActiveInventory: location.hasActiveInventory ?? null,
        shipsInventory: location.shipsInventory ?? null,
        fulfillsOnlineOrders: location.fulfillsOnlineOrders ?? null,
      }));
      return { data, truncated: result.truncated, empty: data.length === 0 };
    });
  }

  /** Fulfillments of orders created in the period (padded window, exact cut here). */
  readFulfillments(
    dateRange: DateRange,
  ): Promise<SourceReadOutcome<readonly CanonicalFulfillment[]>> {
    return outcome(async () => {
      const result = await this.admin.readOrders({
        dateRange,
        hasReadAllOrders: this.hasReadAllOrders,
        createdAt: paddedCreatedAtWindow(dateRange),
      });
      const data = result.records
        .filter((order) => {
          const created = order.createdAt.slice(0, 10);
          return created >= dateRange.startDate && created <= dateRange.endDate;
        })
        .flatMap((order) =>
          order.fulfillments.map((fulfillment): CanonicalFulfillment => ({
            source: "shopify",
            fulfillmentId: fulfillment.id,
            orderId: order.id,
            orderName: order.name,
            orderCreatedAt: order.createdAt,
            createdAt: fulfillment.createdAt,
            inTransitAt: fulfillment.inTransitAt,
            deliveredAt: fulfillment.deliveredAt,
            estimatedDeliveryAt: fulfillment.estimatedDeliveryAt,
            status: fulfillment.status,
            displayStatus: fulfillment.displayStatus,
            locationId: fulfillment.location?.id ?? null,
            locationName: fulfillment.location?.name ?? null,
          })),
        );
      return { data, truncated: result.truncated, empty: data.length === 0 };
    });
  }
}

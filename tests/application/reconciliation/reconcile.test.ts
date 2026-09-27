import { describe, expect, it } from "vitest";

import { reconcile } from "@/src/application/reconciliation/reconcile";
import {
  compareFulfillmentTiming,
  compareLocations,
  compareShopifyMirroredInventory,
  compareSkuIdentity,
} from "@/src/application/reconciliation/tab-comparers";
import type {
  CanonicalFulfillment,
  CanonicalInventoryPosition,
  CanonicalLocation,
  CanonicalVariant,
} from "@/src/domain/commerce/models";

describe("reconcile", () => {
  it("reports keys on one side only, field deltas, duplicates and totals", () => {
    const report = reconcile({
      dataset: "units",
      oldSource: "sheet",
      newSource: "api",
      oldRows: [
        { k: "A", v: 10 },
        { k: "B", v: 5 },
        { k: "B", v: 1 },
        { k: null, v: 2 },
      ],
      newRows: [
        { k: "A", v: 12 },
        { k: "C", v: 3 },
      ],
      oldKey: (row) => row.k,
      newKey: (row) => row.k,
      fields: [{ name: "v", old: (row) => row.v, new: (row) => row.v, total: true }],
    });
    expect(report.status).toBe("mismatch");
    expect(report.onlyInOld).toEqual(["B"]);
    expect(report.onlyInNew).toEqual(["C"]);
    expect(report.duplicateKeysOld).toEqual(["B"]);
    expect(report.unkeyedOld).toBe(1);
    expect(report.differences).toEqual([
      { key: "A", field: "v", oldValue: 10, newValue: 12, delta: 2 },
    ]);
    expect(report.totals).toEqual([{ field: "v", old: 18, new: 15, delta: -3 }]);
  });

  it("matches within tolerance and never presumes either side correct", () => {
    const report = reconcile({
      dataset: "t",
      oldSource: "sheet",
      newSource: "api",
      oldRows: [{ k: "A", v: 1.0001 }],
      newRows: [{ k: "A", v: 1 }],
      oldKey: (row) => row.k,
      newKey: (row) => row.k,
      fields: [{ name: "v", old: (row) => row.v, new: (row) => row.v, tolerance: 0.01 }],
    });
    expect(report.status).toBe("match");
  });
});

const variant = (sku: string, overrides: Partial<CanonicalVariant> = {}): CanonicalVariant => ({
  source: "shopify",
  productId: "gid://shopify/Product/1",
  variantId: `gid://shopify/ProductVariant/${sku}`,
  inventoryItemId: `gid://shopify/InventoryItem/${sku}`,
  sku,
  productTitle: "70% Cacao Dark Chocolate",
  variantTitle: "10-Pack",
  productStatus: "ACTIVE",
  tracked: true,
  ...overrides,
});

describe("tab comparers", () => {
  it("compares SKU_Master identity on the declared shopify_variant_sku mapping", () => {
    const report = compareSkuIdentity(
      [
        {
          sku_id: "DC70",
          shopify_variant_sku: "zac-dc-70-10pk",
          shopify_product_title: "70% Cacao Dark Chocolate",
          shopify_variant_title: "10-Pack",
          is_active: "yes",
        },
        { sku_id: "MANUAL", shopify_variant_sku: null, is_active: "yes" },
      ],
      [variant("ZAC-DC-70-10PK"), variant("ZAC-MB-40-4PK")],
    );
    expect(report.matchedKeys).toBe(1);
    expect(report.onlyInNew).toEqual(["ZAC-MB-40-4PK"]);
    expect(report.differences).toEqual([]);
  });

  it("reports duplicate Shopify location names instead of merging them", () => {
    const location = (name: string, isActive: boolean): CanonicalLocation => ({
      source: "shopify",
      locationId: `gid://shopify/Location/${name}-${isActive}`,
      name,
      isActive,
      hasActiveInventory: isActive,
      shipsInventory: isActive,
      fulfillsOnlineOrders: true,
    });
    const report = compareLocations(
      [
        { location_name: "SNAPL", is_active: "yes" },
        { location_name: "YBYD", is_active: "yes" },
      ],
      [location("SNAPL", true), location("SNAPL", false)],
    );
    expect(report.duplicateKeysNew).toEqual(["snapl"]);
    expect(report.onlyInOld).toEqual(["ybyd"]);
  });

  it("compares Shopify-mirrored snapshot rows in bars at the latest snapshot date", () => {
    const position = (sku: string, onHand: number): CanonicalInventoryPosition => ({
      source: "shopify",
      variantId: null,
      inventoryItemId: `gid://shopify/InventoryItem/${sku}`,
      sku,
      locationId: "gid://shopify/Location/1",
      locationName: "SNAPL",
      asOf: "2026-09-27T12:00:00Z",
      quantities: { on_hand: onHand, available: onHand },
    });
    const report = compareShopifyMirroredInventory({
      skuMaster: [
        { sku_id: "DC70-10", shopify_variant_sku: "ZAC-DC-70-10PK", pack_size_bars: 10 },
        { sku_id: "DC70-4", shopify_variant_sku: "ZAC-DC-70-4PK", pack_size_bars: 4 },
      ],
      locationMaster: [
        { location_name: "SNAPL", is_active: "yes" },
        { location_name: "YBYD", is_active: "yes" },
      ],
      snapshots: [
        { snapshot_at: "2026-09-20", warehouse: "SNAPL", sku: "DC70-10", on_hand: 3_000 },
        { snapshot_at: "2026-09-27", warehouse: "SNAPL", sku: "DC70-10", on_hand: 3_850 },
        { snapshot_at: "2026-09-27", warehouse: "SNAPL", sku: "DC70-4", on_hand: 28 },
        // A manual-only warehouse is out of scope for this comparison.
        { snapshot_at: "2026-09-27", warehouse: "YBYD", sku: "DC70-10", on_hand: 500 },
      ],
      positions: [
        position("ZAC-DC-70-10PK", 385),
        position("ZAC-DC-70-4PK", 7),
        position("ZAC-MB-40-4PK", 2),
      ],
    });
    expect(report.oldSource).toBe("google_sheets:Inventory_Snapshots@2026-09-27");
    expect(report.matchedKeys).toBe(2);
    expect(report.differences).toEqual([]);
    expect(report.totals).toEqual([{ field: "on_hand_bars", old: 3_878, new: 3_878, delta: 0 }]);
    expect(report.notes.join(" ")).toContain("ZAC-MB-40-4PK");
  });

  it("compares ship dates on the New York calendar day by order name", () => {
    const fulfillment: CanonicalFulfillment = {
      source: "shopify",
      fulfillmentId: "gid://shopify/Fulfillment/1",
      orderId: "gid://shopify/Order/1",
      orderName: "#1001",
      orderCreatedAt: "2026-09-01T12:00:00Z",
      // 01:30 UTC on the 3rd is still the 2nd in New York.
      createdAt: "2026-09-03T01:30:00Z",
      inTransitAt: null,
      deliveredAt: null,
      estimatedDeliveryAt: null,
      status: "SUCCESS",
      displayStatus: "DELIVERED",
      locationId: null,
      locationName: "SNAPL",
    };
    const report = compareFulfillmentTiming(
      [{ order_id: "1001", shipped_at: "2026-09-02T18:00:00" }],
      [fulfillment],
    );
    expect(report.status).toBe("match");
  });
});

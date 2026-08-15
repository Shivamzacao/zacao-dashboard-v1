import { describe, expect, it } from "vitest";

import {
  buildManufacturerOperationsViews,
  buildOperationalInventoryViews,
  buildPackagingViews,
  buildRefundRateMetric,
  buildWarehouseAccuracyMetric,
} from "@/src/application/metrics";

import { context, source } from "./fixtures";

const sheetsContext = () => context([source("google_sheets")]);

describe("Operations Intelligence certified calculations", () => {
  it("aggregates multi-line purchase orders by due period for OTIF and lead time", () => {
    const records = [
      {
        record_id: "1",
        po_number: "PO-1",
        sku: "SKU-01",
        units: 60,
        expected_date: "2026-07-20",
        confirmed_date: "2026-06-10",
        production_start_date: "2026-06-15",
        received_date: "2026-07-19",
        received_units: 60,
        accepted_units: 59,
        status: "received",
      },
      {
        record_id: "2",
        po_number: "PO-1",
        sku: "SKU-02",
        units: 40,
        expected_date: "2026-07-20",
        confirmed_date: "2026-06-10",
        production_start_date: "2026-06-15",
        received_date: "2026-07-19",
        received_units: 40,
        accepted_units: 40,
        status: "received",
      },
    ];
    const views = buildManufacturerOperationsViews(sheetsContext(), records);
    expect(views.metrics[0]?.value).toEqual({ kind: "rate_basis_points", value: 10_000 });
    expect(views.metrics[1]?.value).toEqual({ kind: "quantity", value: 39 });
    expect(views.performance.items.map(({ label }) => label)).toEqual([
      "Damage-free",
      "Complete & correct",
      "On time",
    ]);
    expect(views.timeline.rows).toHaveLength(2);
  });

  it("requires every purchase-order line to arrive by its own promised date", () => {
    const views = buildManufacturerOperationsViews(sheetsContext(), [
      {
        record_id: "1",
        po_number: "PO-1",
        sku: "SKU-01",
        units: 60,
        expected_date: "2026-07-15",
        confirmed_date: "2026-06-10",
        received_date: "2026-07-16",
        received_units: 60,
        accepted_units: 60,
        status: "received",
      },
      {
        record_id: "2",
        po_number: "PO-1",
        sku: "SKU-02",
        units: 40,
        expected_date: "2026-07-20",
        confirmed_date: "2026-06-10",
        received_date: "2026-07-19",
        received_units: 40,
        accepted_units: 40,
        status: "received",
      },
    ]);
    expect(views.metrics[0]?.value).toEqual({ kind: "rate_basis_points", value: 0 });
    expect(views.performance.items.find(({ key }) => key === "on-time")?.values).toEqual([
      { kind: "rate_basis_points", value: 0 },
    ]);
  });

  it("uses complete shipped records as the warehouse SLA denominator", () => {
    const result = buildWarehouseAccuracyMetric(sheetsContext(), [
      {
        order_id: "opaque-1",
        promised_ship_at: "2026-07-10T16:00:00Z",
        shipped_at: "2026-07-10T15:00:00Z",
        pick_accurate: "yes",
      },
      {
        order_id: "opaque-2",
        promised_ship_at: "2026-07-11T16:00:00Z",
        shipped_at: "2026-07-11T17:00:00Z",
        pick_accurate: "yes",
      },
      { order_id: "incomplete", shipped_at: "2026-07-12T12:00:00Z" },
    ]);
    expect(result.value).toEqual({ kind: "rate_basis_points", value: 5_000 });
    expect(result.warnings).toContain("WAREHOUSE_COMPLETE_SHIPPED_DENOMINATOR:2");
  });

  it("blocks refund rate for incomplete history and excludes test/cancelled orders", () => {
    const facts = [
      { createdAt: "2026-07-02T00:00:00Z", test: false, cancelledAt: null, refundCount: 1 },
      { createdAt: "2026-07-03T00:00:00Z", test: false, cancelledAt: null, refundCount: 0 },
      { createdAt: "2026-07-04T00:00:00Z", test: true, cancelledAt: null, refundCount: 1 },
      {
        createdAt: "2026-07-05T00:00:00Z",
        test: false,
        cancelledAt: "2026-07-06T00:00:00Z",
        refundCount: 1,
      },
    ];
    expect(buildRefundRateMetric(context(), facts, true).value).toEqual({
      kind: "rate_basis_points",
      value: 5_000,
    });
    expect(buildRefundRateMetric(context(), facts, false).readiness.state).toBe("partial");
  });

  it("converts Shopify packs to bars and prevents overlap with non-Shopify snapshots", () => {
    const views = buildOperationalInventoryViews(
      context([source("shopify"), source("google_sheets")]),
      [
        {
          locationId: "1",
          locationName: "SNAPL Shopify",
          productTitle: "Dark",
          variantTitle: "4 pack",
          sku: "DARK-4",
          quantityName: "on_hand",
          quantity: 10,
          updatedAt: "2026-07-31T00:00:00Z",
        },
        {
          locationId: "1",
          locationName: "SNAPL Shopify",
          productTitle: "Dark",
          variantTitle: "4 pack",
          sku: "DARK-4",
          quantityName: "available",
          quantity: 8,
          updatedAt: "2026-07-31T00:00:00Z",
        },
      ],
      [
        {
          sku_id: "SKU-01",
          canonical_name: "Dark",
          shopify_variant_sku: "DARK-4",
          pack_size_bars: 4,
          is_active: "yes",
        },
      ],
      [
        { location_name: "SNAPL", shopify_location_name: "SNAPL Shopify", is_active: "yes" },
        { location_name: "YBYD", shopify_location_name: null, is_active: "yes" },
      ],
      [{ snapshot_at: "2026-07-31", warehouse: "YBYD", sku: "SKU-01", on_hand: 6 }],
      [
        {
          metric_key: "inventory.stock_min",
          scope_type: "sku",
          scope_value: "SKU-01",
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          target_value: 20,
          status: "active",
        },
        {
          metric_key: "inventory.stock_max",
          scope_type: "sku",
          scope_value: "SKU-01",
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          target_value: 60,
          status: "active",
        },
      ],
    );
    expect(views.shopify.metric.value).toEqual({ kind: "count", value: 40 });
    expect(views.combined.metric.value).toEqual({ kind: "quantity", value: 46 });
    expect(views.stockHealth.value).toEqual({ kind: "status", value: "1 of 1 in band" });
  });

  /**
   * The new operations workbook has no shopify_location_name column and maps only
   * the 4-pack variant per SKU, while Shopify stocks the 10-pack. These cases pin
   * the live shape: 2 packs of ZAC-DC-70-4PK plus 58 of ZAC-MC-42-10PK = 588 bars.
   */
  describe("reading a workbook without shopify_location_name", () => {
    const shopifyStock = (sku: string, quantity: number) => ({
      locationId: "1",
      locationName: "SNAPL",
      productTitle: "Bar",
      variantTitle: "pack",
      sku,
      quantityName: "on_hand" as const,
      quantity,
      updatedAt: "2026-08-13T00:00:00Z",
    });
    const skuMaster = [
      {
        sku_id: "SKU-01",
        canonical_name: "70% Cacao Dark Chocolate",
        shopify_variant_sku: "ZAC-DC-70-4PK",
        pack_size_bars: 4,
        is_active: "yes",
      },
      {
        sku_id: "SKU-02",
        canonical_name: "42% Cacao Smooth Chocolate",
        shopify_variant_sku: "ZAC-MC-42-4PK",
        pack_size_bars: 4,
        is_active: "yes",
      },
    ];
    // Exactly the new workbook's Location_Master: names only, no provider column.
    const locationMaster = [
      { location_id: "LOC-01", location_name: "SNAPL", is_active: "yes" },
      { location_id: "LOC-02", location_name: "YBYD", is_active: "yes" },
    ];

    it("joins on location_name and derives the unmapped pack variant", () => {
      const views = buildOperationalInventoryViews(
        context([source("shopify"), source("google_sheets")]),
        [shopifyStock("ZAC-DC-70-4PK", 2), shopifyStock("ZAC-MC-42-10PK", 58)],
        skuMaster,
        locationMaster,
        [],
        [],
      );
      // 2 x 4 bars + 58 x 10 bars. Pack size comes from the variant suffix, not
      // from the 4-pack sibling that supplied the SKU.
      expect(views.shopify.metric.value).toEqual({ kind: "count", value: 588 });
      expect(views.shopify.metric.warnings ?? []).not.toContain("UNMAPPED_SHOPIFY_LOCATION:SNAPL");
    });

    it("never counts a fallback-joined location twice", () => {
      const views = buildOperationalInventoryViews(
        context([source("shopify"), source("google_sheets")]),
        [shopifyStock("ZAC-DC-70-4PK", 2)],
        skuMaster,
        locationMaster,
        [
          // The connector writes SNAPL back into the sheet; counting both the
          // Shopify quantity and this row would double the same physical bars.
          { snapshot_at: "2026-08-13", warehouse: "SNAPL", sku: "SKU-01", on_hand: 8 },
          { snapshot_at: "2026-08-13", warehouse: "YBYD", sku: "SKU-01", on_hand: 6 },
        ],
        [],
      );
      expect(views.shopify.metric.value).toEqual({ kind: "count", value: 8 });
      expect(views.combined.metric.value).toEqual({ kind: "quantity", value: 14 });
    });

    it("reports Shopify-only stock when no external location has ever been counted", () => {
      const views = buildOperationalInventoryViews(
        context([source("shopify"), source("google_sheets")]),
        [shopifyStock("ZAC-DC-70-4PK", 2), shopifyStock("ZAC-MC-42-10PK", 58)],
        skuMaster,
        [
          ...locationMaster,
          // Seeded ready for use but never snapshotted; that is not missing data.
          { location_id: "LOC-03", location_name: "Amazon FBA", is_active: "yes" },
          { location_id: "LOC-04", location_name: "TikTok Shop External", is_active: "yes" },
        ],
        [],
        [],
      );
      expect(views.combined.metric.value).toEqual({ kind: "quantity", value: 588 });
    });

    it("anchors the latest snapshot on external locations, not daily connector rows", () => {
      const views = buildOperationalInventoryViews(
        context([source("shopify"), source("google_sheets")]),
        [shopifyStock("ZAC-DC-70-4PK", 2)],
        skuMaster,
        locationMaster,
        [
          // The connector writes SNAPL every day; the team counts YBYD weekly.
          // Anchoring on the newest row of any kind would strand the YBYD count.
          { snapshot_at: "2026-08-20", warehouse: "SNAPL", sku: "SKU-01", on_hand: 8 },
          { snapshot_at: "2026-08-15", warehouse: "YBYD", sku: "SKU-01", on_hand: 6 },
        ],
        [],
      );
      expect(views.combined.metric.value).toEqual({ kind: "quantity", value: 14 });
    });

    it("still blocks the total when a counted location misses the latest snapshot", () => {
      const views = buildOperationalInventoryViews(
        context([source("shopify"), source("google_sheets")]),
        [shopifyStock("ZAC-DC-70-4PK", 2)],
        skuMaster,
        [
          ...locationMaster,
          { location_id: "LOC-03", location_name: "Amazon FBA", is_active: "yes" },
        ],
        [
          // Both have history, but only YBYD appears in the newest count.
          { snapshot_at: "2026-08-08", warehouse: "Amazon FBA", sku: "SKU-01", on_hand: 4 },
          { snapshot_at: "2026-08-08", warehouse: "YBYD", sku: "SKU-01", on_hand: 6 },
          { snapshot_at: "2026-08-15", warehouse: "YBYD", sku: "SKU-01", on_hand: 5 },
        ],
        [],
      );
      expect(views.combined.metric.value).toBeNull();
    });

    it("leaves an ambiguous pack family unmapped instead of guessing", () => {
      const views = buildOperationalInventoryViews(
        context([source("shopify"), source("google_sheets")]),
        [shopifyStock("ZAC-MC-42-10PK", 58)],
        [
          // Two canonical SKUs share the family, so no single sibling wins.
          ...skuMaster,
          {
            sku_id: "SKU-05",
            canonical_name: "Tigernut",
            shopify_variant_sku: "ZAC-MC-42-6PK",
            pack_size_bars: 6,
            is_active: "yes",
          },
        ],
        locationMaster,
        [],
        [],
      );
      // Unresolvable, so the metric is unavailable rather than a misleading zero.
      expect(views.shopify.metric.value).toBeNull();
      expect(views.shopify.metric.warnings ?? []).toContain("UNMAPPED_SHOPIFY_SKU:ZAC-MC-42-10PK");
    });
  });

  it("projects four complete packaging months without clamping negative stock", () => {
    const materials = [
      {
        record_id: "m1",
        material_id: "wrap",
        material_name: "Bar wrappers",
        unit: "each",
        ideal_minimum: 30,
        ideal_maximum: 90,
        effective_from: "2026-01-01",
        is_active: "yes",
      },
    ];
    const inventory = [
      {
        record_id: "i1",
        snapshot_date: "2026-07-31",
        material_id: "wrap",
        warehouse: "SNAPL",
        on_hand_quantity: 42,
      },
    ];
    const orders = [
      {
        record_id: "o1",
        po_number: "PO-1",
        material_id: "wrap",
        quantity: 10,
        eta: "2026-09-12",
        destination_warehouse: "SNAPL",
        status: "in_transit",
      },
    ];
    const forecasts = ["08", "09", "10", "11"].map((month) => ({
      record_id: `f-${month}`,
      forecast_version: "approved-1",
      month: `2026-${month}-01`,
      material_id: "wrap",
      consumption_quantity: 20,
      status: "approved",
    }));
    const views = buildPackagingViews(sheetsContext(), materials, inventory, orders, forecasts);
    expect(views.projection.metric.value).toEqual({ kind: "quantity", value: 42 });
    expect(views.projection.items.map((item) => item.values[0])).toEqual([
      { kind: "quantity", value: 22 },
      { kind: "quantity", value: 12 },
      { kind: "quantity", value: -8 },
      { kind: "quantity", value: -28 },
    ]);
  });

  it("aggregates packaging warehouses but blocks malformed or conflicting coverage", () => {
    const materials = [
      {
        record_id: "m1",
        material_id: "carton",
        material_name: "Cartons",
        unit: "each",
        ideal_minimum: 30,
        ideal_maximum: 90,
        effective_from: "2026-01-01",
        is_active: "yes",
      },
    ];
    const inventory = [
      {
        record_id: "i1",
        snapshot_date: "2026-07-31",
        material_id: "carton",
        warehouse: "SNAPL",
        on_hand_quantity: 20,
      },
      {
        record_id: "i2",
        snapshot_date: "2026-07-31",
        material_id: "carton",
        warehouse: "YBYD",
        on_hand_quantity: 22,
      },
    ];
    const forecasts = ["08", "09", "10", "11"].map((month) => ({
      record_id: `f-${month}`,
      forecast_version: "approved-1",
      month: `2026-${month}-01`,
      material_id: "carton",
      consumption_quantity: month === "10" ? null : 5,
      status: "approved",
    }));
    const views = buildPackagingViews(sheetsContext(), materials, inventory, [], forecasts);
    expect(views.stock.metric.value).toEqual({ kind: "quantity", value: 42 });
    expect(views.stock.items[0]?.values[0]).toEqual({ kind: "quantity", value: 42 });
    expect(views.projection.metric.value).toBeNull();
    expect(views.projection.items).toEqual([]);

    const conflict = buildPackagingViews(
      sheetsContext(),
      [...materials, { ...materials.at(0), record_id: "m2" }],
      inventory,
      [],
      [],
    );
    expect(conflict.stock.metric.value).toBeNull();
  });
});

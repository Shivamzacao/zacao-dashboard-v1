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

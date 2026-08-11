import { describe, expect, it } from "vitest";

import {
  buildInventoryRunwayMetric,
  buildInventoryValueMetric,
  buildSellThroughMetric,
  buildUnclassifiedChannelMetric,
  reconcileForecastActuals,
} from "@/src/application/metrics";

import { context, source } from "./fixtures";

const metricContext = context([source("google_sheets"), source("shopify")]);

describe("V1 sheet metric activation", () => {
  it("collapses identical snapshots and rejects conflicting duplicates", () => {
    const costs = [
      {
        sku: "SKU-01",
        cost_basis: "landed",
        effective_from: "2026-01-01",
        total_unit_cost_usd: 2.5,
      },
      {
        sku: "SKU-02",
        cost_basis: "standard",
        effective_from: "2026-01-01",
        total_unit_cost_usd: 2.15,
      },
    ];
    const value = buildInventoryValueMetric(
      metricContext,
      [
        { snapshot_at: "2026-07-31 06:00", warehouse: "SNAPL 3PL", sku: "SKU-01", on_hand: 1_240 },
        { snapshot_at: "2026-07-31 06:00", warehouse: "YBYD", sku: "SKU-02", on_hand: 860 },
        { snapshot_at: "2026-07-31 06:00", warehouse: "Office", sku: "SKU-01", on_hand: 95 },
        { snapshot_at: "2026-07-31 06:00", warehouse: "Office", sku: "SKU-01", on_hand: 95 },
      ],
      costs,
    );
    expect(value.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 518_650 },
    });
    expect(value.warnings).toContain(
      "INVENTORY_DUPLICATE_COLLAPSED:2026-07-31 06:00:Office:SKU-01",
    );

    const conflict = buildInventoryValueMetric(
      metricContext,
      [
        { snapshot_at: "2026-07-31 06:00", warehouse: "SNAPL 3PL", sku: "SKU-01", on_hand: 10 },
        { snapshot_at: "2026-07-31 06:00", warehouse: "SNAPL 3PL", sku: "SKU-01", on_hand: 11 },
      ],
      costs,
    );
    expect(conflict.value).toBeNull();
    expect(conflict.warnings[0]).toContain("INVENTORY_DUPLICATE_CONFLICT");
  });

  it("converts Shopify packs to bars for closed-week variance", () => {
    const reconciled = reconcileForecastActuals(
      metricContext,
      [
        {
          week_start: "2026-07-20",
          sku: "SKU-01",
          channel: "DTC (Shopify)",
          forecast_units: 100,
          status: "approved",
        },
      ],
      [{ sku_id: "SKU-01", shopify_variant_sku: "PACK-10", pack_size_bars: 10 }],
      [
        {
          weekStart: "2026-07-20",
          shopifySku: "PACK-10",
          sourceChannel: "Online Store",
          merchandise: true,
          units: 8,
        },
        {
          weekStart: "2026-07-20",
          shopifySku: null,
          sourceChannel: "Online Store",
          merchandise: true,
          units: 2,
        },
      ],
    );
    expect(reconciled.facts).toEqual([
      {
        period: "2026-07-20",
        sku: "SKU-01",
        channel: "DTC (Shopify)",
        forecastUnits: 100,
        actualUnits: 80,
      },
    ]);
    expect(reconciled.warnings).toContain("UNMAPPED_SHOPIFY_SKU:blank");
  });

  it("calculates four-week runway and sell-through without enabling reorder", () => {
    const snapshots = [
      { snapshot_at: "2026-07-01 00:00", warehouse: "SNAPL 3PL", sku: "SKU-01", available: 700 },
      { snapshot_at: "2026-07-31 00:00", warehouse: "SNAPL 3PL", sku: "SKU-01", available: 1_000 },
    ];
    const forecasts = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"].map(
      (week_start) => ({
        week_start,
        sku: "SKU-01",
        channel: "DTC (Shopify)",
        forecast_units: 140,
        status: "approved",
      }),
    );
    const runway = buildInventoryRunwayMetric(metricContext, snapshots, forecasts);
    expect(runway.value).toEqual({ kind: "quantity", value: 50 });
    expect(runway.warnings).toContain("REORDER_RECOMMENDATION_PHASE_2");

    const sellThrough = buildSellThroughMetric(
      metricContext,
      snapshots,
      [{ received_date: "2026-07-15", received_units: 100 }],
      [
        {
          weekStart: "2026-07-20",
          shopifySku: "PACK-10",
          sourceChannel: "Online Store",
          merchandise: true,
          units: 8,
        },
      ],
      [{ shopify_variant_sku: "PACK-10", pack_size_bars: 10 }],
    );
    expect(sellThrough.value).toEqual({ kind: "rate_basis_points", value: 1_000 });
  });

  it("counts only genuinely unmapped channels", () => {
    const result = buildUnclassifiedChannelMetric(
      metricContext,
      [{ source_system: "shopify", source_channel_or_name: "Online Store", status: "active" }],
      ["Online Store", "Unknown marketplace"],
    );
    expect(result.value).toEqual({ kind: "count", value: 1 });
    expect(result.warnings).toContain("UNCLASSIFIED_CHANNEL:Unknown marketplace");
  });
});

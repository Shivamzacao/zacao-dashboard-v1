import { describe, expect, it } from "vitest";

import {
  buildCogsPerBarViews,
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

/**
 * Landed cost per bar against the approved target (spec §7.1, Appendix C.4).
 * Values mirror the live workbook: SKU-01 and SKU-02 are the only active SKUs,
 * their March costs are lower than July, and the targets were initialised equal
 * to the July baseline.
 */
describe("COGS per bar", () => {
  const skuMaster = [
    { sku_id: "SKU-01", is_active: "yes" },
    { sku_id: "SKU-02", is_active: "yes" },
    { sku_id: "SKU-03", is_active: "no" },
  ];
  /**
   * Landed cost is rebuilt from components under DEC-020, so these rows carry the
   * amount as a component. `total_unit_cost_usd` is still written, deliberately
   * disagreeing where a test needs to prove the stored total is ignored.
   */
  const cost = (sku: string, effectiveFrom: string, total: number, packaging = 0) => ({
    sku,
    effective_from: effectiveFrom,
    cost_basis: "landed",
    production_cost_usd: total - packaging,
    packaging_usd: packaging,
    total_unit_cost_usd: total - packaging,
  });
  const target = (sku: string, value: number) => ({
    metric_key: "target_landed_cogs_per_bar",
    scope_type: "sku",
    scope_value: sku,
    status: "active",
    period_start: "2026-01-01",
    period_end: null,
    target_value: value,
  });

  it("blends active SKUs per effective period and reports the latest as the KPI", () => {
    const views = buildCogsPerBarViews(
      metricContext,
      [
        cost("SKU-01", "2026-03-02", 2.19),
        cost("SKU-02", "2026-03-02", 2.373),
        cost("SKU-01", "2026-07-06", 2.301),
        cost("SKU-02", "2026-07-06", 2.494),
      ],
      [target("SKU-01", 2.301), target("SKU-02", 2.494)],
      skuMaster,
    );

    // March (2.19 + 2.373) / 2 = 2.2815 -> $2.28; July (2.301 + 2.494) / 2 = 2.3975 -> $2.40.
    expect(views.metric.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 240 },
    });
    // A point per cost change, plus the period end as the current reading.
    expect(views.trend.items.map(({ key }) => key)).toEqual([
      "2026-03-02",
      "2026-07-06",
      "2026-07-31",
    ]);
    expect(views.trend.items[0]?.values[0]).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 228 },
    });
    // Target is the dashed comparison series on both points.
    expect(views.trend.items[0]?.values[1]).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 240 },
    });
  });

  it("carries a SKU forward when only one of them repriced", () => {
    const views = buildCogsPerBarViews(
      metricContext,
      [
        cost("SKU-01", "2026-03-02", 2.0),
        cost("SKU-02", "2026-03-02", 3.0),
        // Only SKU-01 changes; SKU-02 must stay in the basket at its old price
        // rather than dropping out and halving the blend's membership.
        cost("SKU-01", "2026-07-06", 2.5),
      ],
      [],
      skuMaster,
    );
    expect(views.trend.items.at(-1)?.values[0]).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 275 },
    });
    expect(views.metric.warnings).toContain("COGS_SKUS_IN_BLEND:2");
  });

  it("excludes inactive SKUs so a planned product cannot move the cost", () => {
    const views = buildCogsPerBarViews(
      metricContext,
      [cost("SKU-01", "2026-07-06", 2.0), cost("SKU-03", "2026-07-06", 9.0)],
      [],
      skuMaster,
    );
    expect(views.metric.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 200 },
    });
    expect(views.metric.warnings).toContain("COGS_SKUS_IN_BLEND:1");
  });

  it("discloses the blend and flags a target that is still the baseline", () => {
    const views = buildCogsPerBarViews(
      metricContext,
      [cost("SKU-01", "2026-07-06", 2.301)],
      [target("SKU-01", 2.301)],
      skuMaster,
    );
    // Spec §7 requires a blended cost be labelled; C.4 requires that an
    // initialised target is not read as management approval.
    expect(views.metric.warnings).toContain("COGS_BLENDED_WITHOUT_SKU_MIX");
    expect(views.metric.warnings).toContain("COGS_TARGET_EQUALS_BASELINE");
  });

  it("does not flag the target once it genuinely differs from actual cost", () => {
    const views = buildCogsPerBarViews(
      metricContext,
      [cost("SKU-01", "2026-07-06", 2.301)],
      [target("SKU-01", 2.1)],
      skuMaster,
    );
    expect(views.metric.warnings).not.toContain("COGS_TARGET_EQUALS_BASELINE");
  });

  it("ignores targets that are not active per-SKU landed-cost rows", () => {
    const views = buildCogsPerBarViews(
      metricContext,
      [cost("SKU-01", "2026-07-06", 2.301)],
      [
        { ...target("SKU-01", 1.0), status: "inactive" },
        { ...target("SKU-01", 1.0), metric_key: "target_revenue_mix" },
        { ...target("SKU-01", 1.0), scope_type: "company" },
        { ...target("SKU-01", 1.0), period_start: "2027-01-01" },
      ],
      skuMaster,
    );
    expect(views.trend.items[0]?.values).toHaveLength(1);
  });

  it("returns null rather than zero when no active SKU has a landed cost", () => {
    const views = buildCogsPerBarViews(
      metricContext,
      [{ ...cost("SKU-01", "2026-07-06", 2.3), cost_basis: "quoted" }],
      [],
      skuMaster,
    );
    expect(views.metric.value).toBeNull();
    expect(views.trend.items).toEqual([]);
  });

  describe("SKUs above COGS target", () => {
    it("counts only the SKUs whose landed cost exceeds their own target", () => {
      const views = buildCogsPerBarViews(
        metricContext,
        [cost("SKU-01", "2026-07-06", 2.45), cost("SKU-02", "2026-07-06", 2.4)],
        [target("SKU-01", 2.301), target("SKU-02", 2.494)],
        skuMaster,
      );

      // SKU-01 is over its target, SKU-02 is under. A blended mean of the two would sit
      // near target and hide both, which is why this compares per SKU.
      expect(views.flags.value).toEqual({ kind: "count", value: 1 });
      expect(views.flags.warnings).toContain("COGS_FLAGS_SKUS_COMPARED:2");
    });

    it("reads zero and discloses the baseline when targets equal cost", () => {
      // The live workbook's state: every target was initialised to that SKU's landed
      // cost, so a zero here is the initialisation and must not read as a goal met.
      const views = buildCogsPerBarViews(
        metricContext,
        [cost("SKU-01", "2026-07-06", 2.301), cost("SKU-02", "2026-07-06", 2.494)],
        [target("SKU-01", 2.301), target("SKU-02", 2.494)],
        skuMaster,
      );

      expect(views.flags.value).toEqual({ kind: "count", value: 0 });
      expect(views.flags.warnings).toContain("COGS_TARGET_EQUALS_BASELINE");
    });

    it("does not flag a SKU sitting a fraction of a cent above its target", () => {
      const views = buildCogsPerBarViews(
        metricContext,
        [cost("SKU-01", "2026-07-06", 2.3011), cost("SKU-02", "2026-07-06", 2.494)],
        [target("SKU-01", 2.301), target("SKU-02", 2.494)],
        skuMaster,
      );

      // Float noise on an initialised-equal target is not a cost overrun.
      expect(views.flags.value).toEqual({ kind: "count", value: 0 });
    });

    it("ignores an inactive SKU even when its cost is over target", () => {
      const views = buildCogsPerBarViews(
        metricContext,
        [cost("SKU-01", "2026-07-06", 2.301), cost("SKU-03", "2026-07-06", 9.99)],
        [target("SKU-01", 2.301), target("SKU-03", 2.567)],
        skuMaster,
      );

      // SKU-03 is is_active "no" — a planned product cannot flag what ZACAO sells.
      expect(views.flags.value).toEqual({ kind: "count", value: 0 });
      expect(views.flags.warnings).toContain("COGS_FLAGS_SKUS_COMPARED:1");
    });

    it("excludes and discloses a costed SKU that has no approved target", () => {
      const views = buildCogsPerBarViews(
        metricContext,
        [cost("SKU-01", "2026-07-06", 2.301), cost("SKU-02", "2026-07-06", 2.494)],
        [target("SKU-01", 2.301)],
        skuMaster,
      );

      // Unmeasured is not on target, so SKU-02 is left out rather than counted as a pass.
      expect(views.flags.value).toEqual({ kind: "count", value: 0 });
      expect(views.flags.warnings).toContain("COGS_FLAGS_SKUS_WITHOUT_TARGET:1");
      expect(views.flags.warnings).toContain("COGS_FLAGS_SKUS_COMPARED:1");
    });

    it("withholds rather than reporting zero when no target applies at all", () => {
      const views = buildCogsPerBarViews(
        metricContext,
        [cost("SKU-01", "2026-07-06", 2.301), cost("SKU-02", "2026-07-06", 2.494)],
        [],
        skuMaster,
      );

      expect(views.flags.value).toBeNull();
      expect(views.flags.unavailableReason).toBe(
        "No active SKU has both an effective landed cost and an approved target for this period.",
      );
    });

    it("discloses a target set on the pre-DEC-020 basis that omits packaging", () => {
      // The live workbook's exact shape: the target equals the STORED total_unit_cost_usd
      // (2.301), which omits packaging, while landed cost is recomputed from components
      // (1.501 + 0.090 + 0.800 = 2.391). The SKU reads as over target by exactly its
      // packaging cost, which is a basis mismatch rather than costs having risen.
      const views = buildCogsPerBarViews(
        metricContext,
        [cost("SKU-01", "2026-07-06", 2.391, 0.09)],
        [target("SKU-01", 2.301)],
        [{ sku_id: "SKU-01", is_active: "yes" }],
      );

      expect(views.flags.value).toEqual({ kind: "count", value: 1 });
      expect(views.flags.warnings).toContain("COGS_TARGET_PREDATES_LANDED_BASIS:1");
    });

    it("does not claim a stale basis when the target differs from the stored total", () => {
      // Genuine cost drift: the target is not the stored total, so the overrun is real.
      const views = buildCogsPerBarViews(
        metricContext,
        [cost("SKU-01", "2026-07-06", 2.5, 0.09)],
        [target("SKU-01", 2.1)],
        [{ sku_id: "SKU-01", is_active: "yes" }],
      );

      expect(views.flags.value).toEqual({ kind: "count", value: 1 });
      expect(views.flags.warnings.some((w) => w.startsWith("COGS_TARGET_PREDATES_LANDED_BASIS"))).toBe(
        false,
      );
    });

    it("ignores a target whose period ended before the reporting period", () => {
      const views = buildCogsPerBarViews(
        metricContext,
        [cost("SKU-01", "2026-07-06", 9.99)],
        [{ ...target("SKU-01", 2.301), period_end: "2026-06-30" }],
        skuMaster,
      );

      // The only target expired, so the overrun cannot be judged against anything.
      expect(views.flags.value).toBeNull();
    });
  });
});

describe("COGS per bar target timing", () => {
  it("still plots the target when it takes effect after the last cost record", () => {
    // The live workbook's targets start 2026-08-15 while every cost record is
    // older, so keying points on cost dates alone would hide the target line.
    const views = buildCogsPerBarViews(
      context([source("google_sheets")]),
      [
        {
          sku: "SKU-01",
          effective_from: "2026-07-06",
          cost_basis: "landed",
          production_cost_usd: 2.301,
        },
      ],
      [
        {
          metric_key: "target_landed_cogs_per_bar",
          scope_type: "sku",
          scope_value: "SKU-01",
          status: "active",
          period_start: "2026-07-25",
          period_end: null,
          target_value: 2.301,
        },
      ],
      [{ sku_id: "SKU-01", is_active: "yes" }],
    );
    const withTarget = views.trend.items.filter(({ values }) => values.length === 2);
    expect(withTarget.map(({ key }) => key)).toEqual(["2026-07-25", "2026-07-31"]);
    expect(views.metric.warnings).toContain("COGS_TARGET_EQUALS_BASELINE");
  });
});

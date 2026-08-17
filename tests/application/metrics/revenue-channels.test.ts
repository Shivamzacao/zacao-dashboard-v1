import { describe, expect, it } from "vitest";

import { buildRevenueChannelViews, REVENUE_CHANNELS } from "@/src/application/metrics";
import type { MetricServiceContext, NativeChannelFact } from "@/src/application/metrics/types";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";
import type { MetricViewModel } from "@/src/application/view-models";
import type { SourceStatus } from "@/src/domain/contracts";

const current = (source: SourceStatus["source"]): SourceStatus => ({
  source,
  state: "current",
  checkedAt: "2026-08-08T00:00:00Z",
  lastSuccessfulAt: "2026-08-08T00:00:00Z",
  dataAsOf: "2026-08-07T23:59:59Z",
  completeness: "complete",
  warningCodes: [],
});

const context: MetricServiceContext = {
  environment: "production",
  dataPeriod: { startDate: "2026-07-08", endDate: "2026-08-07" },
  sourceStatuses: [current("shopify"), current("google_sheets")],
};

function fact(
  channel: string,
  netSalesMinorUnits: number,
  orders = 1,
  averageOrderValueMinorUnits: number | null = netSalesMinorUnits,
): NativeChannelFact {
  return {
    channel,
    orders,
    netSalesMinorUnits,
    totalSalesMinorUnits: netSalesMinorUnits,
    averageOrderValueMinorUnits,
  };
}

function mapping(
  source: string,
  dashboard: string,
  overrides: Partial<SheetRecord> = {},
): SheetRecord {
  return {
    source_system: "Shopify",
    source_channel_or_name: source,
    dashboard_channel: dashboard,
    effective_from: "2026-01-01",
    effective_to: "2026-12-31",
    status: "Active",
    ...overrides,
  };
}

function money(metric: MetricViewModel): number | null {
  return metric.value?.kind === "money" ? metric.value.value.minorUnits : null;
}

describe("Revenue Intelligence channel taxonomy", () => {
  it("uses the approved taxonomy, excludes Events from rollups, and reconciles the channel total", () => {
    const result = buildRevenueChannelViews(
      context,
      [
        fact("Online Store", 100_00, 2, 5_500),
        fact("Faire", 200_00, 1, 20_000),
        fact("Summer market", 30_00, 1, 3_000),
        fact("Mystery channel", 40_00, 1, 4_000),
      ],
      [
        mapping("Online Store", "DTC — Site"),
        mapping("Faire", "Wholesale / Faire"),
        mapping("Summer market", "Events / Pop-ups"),
      ],
    );

    expect(REVENUE_CHANNELS).toEqual([
      "DTC — Site",
      "DTC — Affiliate",
      "ShopMy",
      "TikTok Shop",
      "IG Shop",
      "Wholesale / Faire",
      "In-store — Distribution",
      "In-store — Cafés",
      "Events / Pop-ups",
      "Unclassified",
    ]);
    expect(money(result.dtcTotal)).toBe(100_00);
    expect(money(result.retailTotal)).toBe(200_00);
    expect(money(result.channelMix.metric)).toBe(370_00);
    expect(result.dtcTotal.readiness.state).toBe("partial");
    expect(result.channelMix.items.map(({ label }) => label)).toEqual([
      "DTC — Site",
      "Wholesale / Faire",
      "Events / Pop-ups",
      "Unclassified",
    ]);
    expect(result.channelPerformance.rows).toContainEqual({
      channel: "DTC — Site",
      revenueMinorUnits: 100_00,
      orders: 2,
      averageOrderValueMinorUnits: 5_500,
      // Was null while channel fees had no source. Now derived from the channel
      // economics table, and disclosed as provisional on the metric itself.
      marginBasisPoints: 5284,
    });
  });

  it("applies only active mappings effective on the reporting-period end date", () => {
    const result = buildRevenueChannelViews(
      context,
      [fact("Current", 10_00), fact("Future", 20_00), fact("Expired", 30_00)],
      [
        mapping("Current", "TikTok Shop"),
        mapping("Future", "IG Shop", { effective_from: "2026-08-08" }),
        mapping("Expired", "ShopMy", { effective_to: "2026-08-06" }),
      ],
    );

    expect(money(result.dtcTotal)).toBe(10_00);
    expect(
      result.channelMix.items.find(({ label }) => label === "Unclassified")?.values[0],
    ).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 50_00 } });
  });

  it("accepts safe legacy aliases but never infers ambiguous legacy or Amazon categories", () => {
    const result = buildRevenueChannelViews(
      context,
      [fact("Legacy site", 10_00), fact("Distributor feed", 20_00), fact("Amazon", 30_00)],
      [
        mapping("Legacy site", "DTC (Shopify)"),
        mapping("Distributor feed", "Distributor"),
        mapping("Amazon", "Amazon FBA"),
      ],
    );

    expect(money(result.dtcTotal)).toBe(10_00);
    expect(money(result.retailTotal)).toBe(20_00);
    expect(result.channelMix.metric.warnings).toContain("AMBIGUOUS_LEGACY_CHANNEL_MAPPING");
    expect(result.channelMix.items.map(({ label }) => label)).toContain("Unclassified");
  });

  it("routes conflicting mappings to Unclassified and never fabricates group zeroes", () => {
    const unresolved = buildRevenueChannelViews(
      context,
      [fact("Conflicted", 50_00)],
      [mapping("Conflicted", "DTC — Site"), mapping("Conflicted", "Wholesale / Faire")],
    );

    expect(money(unresolved.dtcTotal)).toBeNull();
    expect(money(unresolved.retailTotal)).toBeNull();
    expect(unresolved.dtcTotal.readiness.state).toBe("partial");
    expect(unresolved.dtcTotal.warnings).toContain("CHANNEL_ROLLUP_UNRESOLVED");

    const classifiedElsewhere = buildRevenueChannelViews(
      context,
      [fact("Event", 25_00)],
      [mapping("Event", "Events / Pop-ups")],
    );
    expect(money(classifiedElsewhere.dtcTotal)).toBe(0);
    expect(money(classifiedElsewhere.retailTotal)).toBe(0);
  });

  it("passes through a single provider AOV and nulls an aggregate that would require re-division", () => {
    const result = buildRevenueChannelViews(
      context,
      [fact("Site A", 10_00, 1, 1_111), fact("Site B", 20_00, 2, 2_222)],
      [mapping("Site A", "DTC — Site"), mapping("Site B", "DTC — Site")],
    );
    expect(result.channelPerformance.rows[0]).toMatchObject({
      channel: "DTC — Site",
      revenueMinorUnits: 30_00,
      orders: 3,
      averageOrderValueMinorUnits: null,
      // Negative, and deliberately not clamped: three $10 orders each carry $7.96
      // of fulfillment, so they genuinely lose money. Flooring this at zero would
      // hide exactly the problem the metric exists to surface.
      marginBasisPoints: -1323,
    });
  });
});

/**
 * Revenue Intelligence reads the new workbook, whose only sheet dependency is
 * Channel_Mapping. These pin the live shape: ZACAO maps Online Store and Faire,
 * and deliberately leaves Draft Orders and Shopify Mobile unclassified.
 */
describe("Revenue Intelligence on the migrated workbook", () => {
  const shopifyChannels = [
    fact("Online Store", 426_550, 72),
    fact("Faire: Sell Wholesale", 191_726, 27),
    fact("Draft Orders", 656_513, 67),
    fact("Shopify Mobile for iPhone", 180_000, 2),
  ];
  const zacaoMappings = [
    mapping("Online Store", "DTC — Site", { sop_channel: "D2C / Website" }),
    mapping("Faire: Sell Wholesale", "Wholesale / Faire", { sop_channel: "Wholesale" }),
  ];

  it("reproduces the approved two-row mapping with the rest unclassified", () => {
    const views = buildRevenueChannelViews(context, shopifyChannels, zacaoMappings);

    expect(money(views.dtcTotal)).toBe(426_550);
    expect(money(views.retailTotal)).toBe(191_726);
    expect(money(views.channelMix.metric)).toBe(426_550 + 191_726 + 656_513 + 180_000);
    const barValue = (item: (typeof views.channelMix.items)[number]) => {
      const value = item.values[0];
      return value?.kind === "money" ? value.value.minorUnits : null;
    };
    expect(views.channelMix.items.map((item) => [item.label, barValue(item)])).toEqual([
      ["DTC — Site", 426_550],
      ["Wholesale / Faire", 191_726],
      // Draft Orders and Shopify Mobile pool here until ZACAO approves an
      // order-tag rule; unmapped revenue is disclosed, never silently assigned.
      ["Unclassified", 656_513 + 180_000],
    ]);
    expect(views.dtcTotal.warnings).toContain("UNCLASSIFIED_CHANNEL_PRESENT");
  });

  it("nulls both rollups when Channel_Mapping is missing from the workbook", () => {
    // The guard against migrating a page before its tab exists: with no mapping
    // every channel collapses into Unclassified and the rollups cannot be
    // attributed, so they must go unavailable rather than report a partial total.
    const views = buildRevenueChannelViews(context, shopifyChannels, []);

    expect(money(views.dtcTotal)).toBeNull();
    expect(money(views.retailTotal)).toBeNull();
    expect(views.dtcTotal.warnings).toContain("CHANNEL_ROLLUP_UNRESOLVED");
    expect(views.retailTotal.warnings).toContain("CHANNEL_ROLLUP_UNRESOLVED");
    expect(views.channelMix.items.map((item) => item.label)).toEqual(["Unclassified"]);
  });

  it("drops a mapping whose dashboard_channel is not in the approved taxonomy", () => {
    // Guards the em dash in "DTC — Site": a hyphen would silently unmap revenue.
    const views = buildRevenueChannelViews(context, shopifyChannels, [
      mapping("Online Store", "DTC - Site"),
      ...zacaoMappings.slice(1),
    ]);
    expect(money(views.dtcTotal)).toBeNull();
    expect(views.channelMix.items.map((item) => item.label)).toEqual([
      "Wholesale / Faire",
      "Unclassified",
    ]);
  });
});

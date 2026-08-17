import {
  metricBreakdownViewModelSchema,
  metricTableViewModelSchema,
  type MetricBreakdownViewModel,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";
import type { SourceStatus } from "@/src/domain/contracts";
import { channelContributionMarginBasisPoints } from "@/src/domain/metrics/channel-economics";
import { usd } from "@/src/domain/utilities/money";

import type { MetricServiceContext, NativeChannelFact } from "./types";
import { createMetricViewModel } from "./view-model";

export const REVENUE_CHANNELS = [
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
] as const;

export type RevenueChannel = (typeof REVENUE_CHANNELS)[number];

const DTC_CHANNELS = new Set<RevenueChannel>([
  "DTC — Site",
  "DTC — Affiliate",
  "ShopMy",
  "TikTok Shop",
  "IG Shop",
]);
const RETAIL_CHANNELS = new Set<RevenueChannel>([
  "Wholesale / Faire",
  "In-store — Distribution",
  "In-store — Cafés",
]);
const UNCLASSIFIED: RevenueChannel = "Unclassified";
const CHANNEL_BY_NORMALIZED_NAME = new Map(
  REVENUE_CHANNELS.map((channel) => [normalize(channel), channel] as const),
);
const SAFE_LEGACY_CHANNELS: Readonly<Record<string, RevenueChannel>> = Object.freeze({
  "dtc (shopify)": "DTC — Site",
  distributor: "In-store — Distribution",
});

function normalize(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function text(record: SheetRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function canonicalChannel(value: string): RevenueChannel | null {
  const normalized = normalize(value);
  return CHANNEL_BY_NORMALIZED_NAME.get(normalized) ?? SAFE_LEGACY_CHANNELS[normalized] ?? null;
}

function activeChannelMappings(
  records: readonly SheetRecord[],
  endDate: string,
): { readonly values: ReadonlyMap<string, RevenueChannel>; readonly warnings: readonly string[] } {
  const candidates = new Map<string, Set<RevenueChannel>>();
  const warnings = new Set<string>();

  for (const record of records) {
    if (normalize(text(record, "source_system") ?? "") !== "shopify") continue;
    if (normalize(text(record, "status") ?? "") !== "active") continue;
    const from = text(record, "effective_from");
    const to = text(record, "effective_to");
    if ((from && from > endDate) || (to && to < endDate)) continue;

    const source = text(record, "source_channel_or_name");
    const dashboard = text(record, "dashboard_channel");
    if (!source || !dashboard) continue;
    const canonical = canonicalChannel(dashboard);
    if (!canonical) {
      warnings.add("AMBIGUOUS_LEGACY_CHANNEL_MAPPING");
      continue;
    }
    const key = normalize(source);
    const values = candidates.get(key) ?? new Set<RevenueChannel>();
    values.add(canonical);
    candidates.set(key, values);
  }

  const values = new Map<string, RevenueChannel>();
  for (const [source, mapped] of candidates) {
    if (mapped.size !== 1) {
      warnings.add("CONFLICTING_CHANNEL_MAPPING");
      continue;
    }
    const channel = mapped.values().next().value;
    if (channel) values.set(source, channel);
  }
  return { values, warnings: [...warnings] };
}

function partialSources(
  sources: readonly SourceStatus[],
  warnings: readonly string[],
): readonly SourceStatus[] {
  let marked = false;
  return sources.map((source) => {
    if (
      marked ||
      !["current", "no_activity"].includes(source.state) ||
      !["google_sheets", "shopify"].includes(source.source)
    ) {
      return source;
    }
    marked = true;
    return {
      ...source,
      state: "partial" as const,
      completeness: "partial" as const,
      warningCodes: [...new Set([...source.warningCodes, ...warnings])],
    };
  });
}

function metric(
  context: MetricServiceContext,
  key: string,
  value: number | null,
  warnings: readonly string[],
  partial: boolean,
): MetricViewModel {
  return createMetricViewModel({
    metricKey: key,
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: partial ? partialSources(context.sourceStatuses, warnings) : context.sourceStatuses,
    value: value === null ? null : { kind: "money", value: usd(value) },
    warnings,
  });
}

/**
 * A basis-points metric whose sources are always marked partial.
 *
 * Margin is derived from placeholder fee rates and an estimated bar count, so it
 * is never "current" no matter how healthy Shopify and the workbook are. Routing
 * it through `partialSources` puts the disclosure on the source itself, which is
 * what drives the visible state on the card — a reader must not be able to see
 * this percentage without also seeing that it is provisional.
 */
function rateMetric(
  context: MetricServiceContext,
  key: string,
  basisPoints: number | null,
  warnings: readonly string[],
): MetricViewModel {
  const base = createMetricViewModel({
    metricKey: key,
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: partialSources(context.sourceStatuses, warnings),
    value: basisPoints === null ? null : { kind: "rate_basis_points", value: basisPoints },
    warnings,
  });
  if (!warnings.includes("CHANNEL_FEES_PROVISIONAL")) return base;
  // The default partial copy — "Source data has a disclosed limitation" — reads
  // as a transient source hiccup. This one is not transient and is not the
  // source's fault: the fee rates are invented. Say so.
  return {
    ...base,
    readiness: {
      ...base.readiness,
      state: "partial" as const,
      message:
        "Provisional: channel fee rates are placeholders awaiting ZACAO approval, and COGS is estimated from a blended per-bar cost.",
    },
  };
}

function unresolvedRollup(
  context: MetricServiceContext,
  key: string,
  warnings: readonly string[],
): MetricViewModel {
  const base = metric(context, key, null, warnings, true);
  return {
    ...base,
    readiness: {
      state: "partial",
      message: "Unclassified revenue prevents a complete channel rollup.",
      warningCodes: [...new Set(["CHANNEL_ROLLUP_UNRESOLVED", ...warnings])],
    },
    warnings: [...new Set(["CHANNEL_ROLLUP_UNRESOLVED", ...base.warnings])],
    unavailableReason:
      "No revenue is explicitly mapped to this group, and Unclassified revenue could belong to it.",
  };
}

interface AggregatedChannel {
  readonly channel: RevenueChannel;
  readonly revenueMinorUnits: number;
  readonly orders: number;
  readonly averageOrderValueMinorUnits: number | null;
}

export function buildRevenueChannelViews(
  context: MetricServiceContext,
  facts: readonly NativeChannelFact[],
  mappingRecords: readonly SheetRecord[],
): {
  readonly dtcTotal: MetricViewModel;
  readonly retailTotal: MetricViewModel;
  readonly channelMix: MetricBreakdownViewModel;
  readonly channelMargin: MetricBreakdownViewModel;
  readonly channelPerformance: MetricTableViewModel;
} {
  const mappings = activeChannelMappings(mappingRecords, context.dataPeriod.endDate);
  const grouped = new Map<RevenueChannel, NativeChannelFact[]>();
  const warnings = new Set(mappings.warnings);

  for (const fact of facts) {
    const mapped =
      normalize(fact.channel) === normalize(UNCLASSIFIED)
        ? UNCLASSIFIED
        : mappings.values.get(normalize(fact.channel));
    const channel = mapped ?? UNCLASSIFIED;
    if (!mapped) warnings.add("UNCLASSIFIED_CHANNEL_PRESENT");
    grouped.set(channel, [...(grouped.get(channel) ?? []), fact]);
  }

  const channels: AggregatedChannel[] = REVENUE_CHANNELS.flatMap((channel) => {
    const rows = grouped.get(channel) ?? [];
    if (rows.length === 0) return [];
    return [
      {
        channel,
        revenueMinorUnits: rows.reduce((total, row) => total + row.netSalesMinorUnits, 0),
        orders: rows.reduce((total, row) => total + row.orders, 0),
        // Provider AOV is a pass-through. Multiple provider rows cannot be
        // recombined without re-dividing, so the aggregate stays unavailable.
        averageOrderValueMinorUnits:
          rows.length === 1 ? (rows[0]?.averageOrderValueMinorUnits ?? null) : null,
      },
    ];
  });

  const warningList = [...warnings];
  const unclassifiedRevenue =
    channels.find(({ channel }) => channel === UNCLASSIFIED)?.revenueMinorUnits ?? 0;
  const hasUnclassifiedRevenue = unclassifiedRevenue !== 0;
  const totalRevenue = facts.length
    ? channels.reduce((total, channel) => total + channel.revenueMinorUnits, 0)
    : null;
  const groupMetric = (key: string, included: ReadonlySet<RevenueChannel>) => {
    const rows = channels.filter(({ channel }) => included.has(channel));
    if (facts.length === 0) return metric(context, key, null, warningList, false);
    if (rows.length === 0 && hasUnclassifiedRevenue) {
      return unresolvedRollup(context, key, warningList);
    }
    return metric(
      context,
      key,
      rows.reduce((total, row) => total + row.revenueMinorUnits, 0),
      warningList,
      hasUnclassifiedRevenue,
    );
  };

  const channelMetric = metric(
    context,
    "revenue.channel_mix",
    totalRevenue,
    warningList,
    hasUnclassifiedRevenue,
  );
  const channelMix = metricBreakdownViewModelSchema.parse({
    metric: channelMetric,
    dimension: "dashboard_channel",
    items: channels.map((channel) => ({
      key: channel.channel,
      label: channel.channel,
      values: [{ kind: "money", value: usd(channel.revenueMinorUnits) }],
      warnings: channel.channel === UNCLASSIFIED ? ["UNCLASSIFIED_CHANNEL"] : [],
    })),
  });
  // Contribution margin per channel. Channels with no configured economics —
  // Unclassified above all — return null rather than a blended guess, and are
  // left out of the company rate's numerator *and* denominator so they cannot
  // drag it toward a number nobody can defend.
  const margins = new Map(
    channels.map((channel) => [
      channel.channel,
      channelContributionMarginBasisPoints({
        channel: channel.channel,
        revenueMinorUnits: channel.revenueMinorUnits,
        orders: channel.orders,
      }),
    ]),
  );
  const marginWarnings = new Set(warningList);
  // Every rate but TikTok Shop's is a working placeholder, so any margin built
  // from them has to arrive labelled. Dropping this warning would turn invented
  // fees into an approved-looking percentage.
  if ([...margins.values()].some((result) => result.provisional)) {
    marginWarnings.add("CHANNEL_FEES_PROVISIONAL");
  }
  // Per-channel revenue carries no unit counts, so bars are inferred from price
  // and COGS is the blended per-bar cost, not a SKU mix.
  marginWarnings.add("MARGIN_ESTIMATED_FROM_BLENDED_COGS");
  const pricedChannels = channels.filter(
    ({ channel }) => margins.get(channel)?.marginMinorUnits !== null,
  );
  if (pricedChannels.length < channels.length) {
    marginWarnings.add("CHANNEL_ECONOMICS_MISSING");
  }
  const marginRevenue = pricedChannels.reduce((total, row) => total + row.revenueMinorUnits, 0);
  const marginAmount = pricedChannels.reduce(
    (total, row) => total + (margins.get(row.channel)?.marginMinorUnits ?? 0),
    0,
  );
  const marginWarningList = [...marginWarnings];
  const blendedMargin =
    marginRevenue > 0 ? Math.round((marginAmount / marginRevenue) * 10_000) : null;
  const marginMetric = rateMetric(
    context,
    "revenue.channel_margin",
    blendedMargin,
    marginWarningList,
  );
  const channelMargin = metricBreakdownViewModelSchema.parse({
    metric: marginMetric,
    dimension: "dashboard_channel",
    items: pricedChannels.map((channel) => ({
      key: channel.channel,
      label: channel.channel,
      values: [
        { kind: "rate_basis_points", value: margins.get(channel.channel)?.basisPoints ?? 0 },
      ],
      warnings: margins.get(channel.channel)?.provisional ? ["CHANNEL_FEES_PROVISIONAL"] : [],
    })),
  });

  const channelPerformance = metricTableViewModelSchema.parse({
    metric: channelMetric,
    columns: [
      "channel",
      "revenueMinorUnits",
      "orders",
      "averageOrderValueMinorUnits",
      "marginBasisPoints",
    ],
    rows: channels.map((channel) => ({
      channel: channel.channel,
      revenueMinorUnits: channel.revenueMinorUnits,
      orders: channel.orders,
      averageOrderValueMinorUnits: channel.averageOrderValueMinorUnits,
      marginBasisPoints: margins.get(channel.channel)?.basisPoints ?? null,
    })),
  });

  return {
    dtcTotal: groupMetric("revenue.dtc_total", DTC_CHANNELS),
    retailTotal: groupMetric("revenue.retail_total", RETAIL_CHANNELS),
    channelMix,
    channelMargin,
    channelPerformance,
  };
}

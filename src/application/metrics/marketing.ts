import {
  metricBreakdownViewModelSchema,
  metricSeriesViewModelSchema,
  metricTableViewModelSchema,
  type MetricBreakdownViewModel,
  type MetricSeriesViewModel,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";
import type {
  AffiliateSalesFact,
  AffiliateSessionFact,
  MetricServiceContext,
  TrafficAttributionFact,
} from "./types";
import { usdFromDecimalNumber } from "@/src/domain/metrics/calculations";
import { ratioToBasisPoints, usd } from "@/src/domain/utilities/money";
import { createMetricViewModel } from "./view-model";

const SOCIAL_CHANNELS = ["instagram", "tiktok", "youtube"] as const;
const COLLAB_TABLE_LIFECYCLES = new Set(["live", "in_production", "scheduled"]);
const ACTIVE_COLLAB_LIFECYCLES = new Set(["live", "in_production"]);

const text = (row: SheetRecord, key: string) => {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};
const number = (row: SheetRecord, key: string) => {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};
const label = (value: string) =>
  value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
const month = (date: string) => date.slice(0, 7);

function metric(
  context: MetricServiceContext,
  metricKey: string,
  value: Parameters<typeof createMetricViewModel>[0]["value"],
  warnings: readonly string[] = [],
  dataPendingReason?: string,
): MetricViewModel {
  return createMetricViewModel({
    metricKey,
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: context.sourceStatuses,
    value,
    warnings,
    ...(dataPendingReason ? { dataPendingReason } : {}),
  });
}

function inDateRange(date: string | null, context: MetricServiceContext): boolean {
  return (
    date !== null && date >= context.dataPeriod.startDate && date <= context.dataPeriod.endDate
  );
}

function overlaps(
  start: string | null,
  end: string | null,
  context: MetricServiceContext,
): boolean {
  return (
    start !== null &&
    start <= context.dataPeriod.endDate &&
    (end === null || end >= context.dataPeriod.startDate)
  );
}

interface LatestSocial {
  readonly platform: string;
  readonly account: string;
  readonly date: string;
  readonly followers: number | null;
}

function latestSocialRows(
  records: readonly SheetRecord[],
  endDate: string,
): readonly LatestSocial[] {
  const latest = new Map<string, LatestSocial>();
  for (const row of records) {
    const platform = text(row, "platform");
    const account = text(row, "account");
    const date = text(row, "snapshot_date");
    if (!platform || !account || !date || date > endDate) continue;
    const key = `${platform}:${account}`;
    if ((latest.get(key)?.date ?? "") <= date) {
      latest.set(key, { platform, account, date, followers: number(row, "followers") });
    }
  }
  return [...latest.values()];
}

export function buildMarketingSpendMonthlyBreakdown(
  context: MetricServiceContext,
  rows: readonly SheetRecord[],
): MetricBreakdownViewModel {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const date = text(row, "date");
    const spend = number(row, "spend_usd");
    if (!inDateRange(date, context) || spend === null || !date) continue;
    const key = month(date);
    totals.set(key, (totals.get(key) ?? 0) + spend);
  }
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
  const base = metric(
    context,
    "marketing.spend",
    totals.size ? { kind: "money", value: usdFromDecimalNumber(total) } : null,
    ["SPEND_ONLY_NO_ATTRIBUTION"],
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "month",
    items: [...totals]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([period, spend]) => ({
        key: period,
        label: period,
        values: [{ kind: "money", value: usdFromDecimalNumber(spend) }],
        warnings: [],
      })),
  });
}

/**
 * Paid CAC: paid media spend divided by the first-time customers the ad platforms
 * attribute to it (spec §C.2).
 *
 * Scoped to paid media on purpose. A blended company CAC would need a deduplicated
 * new-customer population across Shopify and the true external channels, which no
 * source supplies yet, and publishing a paid numerator over a whole-company
 * denominator would flatter the number by every organic customer.
 *
 * `conversions` is never the denominator even though it is the fuller column: a
 * conversion counts repeat buyers, so it answers a different question.
 */
export function buildPaidCacMetric(
  context: MetricServiceContext,
  rows: readonly SheetRecord[],
): MetricViewModel {
  const applicable = rows.filter((row) => inDateRange(text(row, "date"), context));
  let spendMinorUnits = 0;
  let customers = 0;
  let uncountedSpend = false;
  for (const row of applicable) {
    const spend = number(row, "spend_usd");
    const acquired = number(row, "new_customers_acquired");
    if (spend === null) continue;
    // A campaign with spend but no attributed-customer count leaves both sides
    // alone. Adding its spend to the numerator while its customers are unknown
    // would charge it to other campaigns' customers and understate the cost.
    if (acquired === null || acquired <= 0) {
      uncountedSpend = true;
      continue;
    }
    spendMinorUnits += Math.round(spend * 100);
    customers += acquired;
  }
  const warnings = [
    // The denominator is whatever the ad platform reported, under whichever
    // attribution model and window that platform used. Never presented as
    // Shopify-verified acquisition.
    "PAID_CAC_PLATFORM_REPORTED",
    ...(uncountedSpend ? ["PAID_CAC_SPEND_COVERAGE_PARTIAL"] : []),
  ];
  return metric(
    context,
    "marketing.paid_cac",
    customers === 0 ? null : { kind: "money", value: usd(Math.round(spendMinorUnits / customers)) },
    warnings,
    customers > 0
      ? undefined
      : uncountedSpend
        ? // Spend ran but no campaign reported attributed first-time customers.
          // Saying "no activity" here would read as "no campaigns ran", which is
          // the opposite of what happened.
          "Paid campaigns ran, but none reported attributed first-time customers."
        : "No paid campaign spend in the selected period.",
  );
}

export function buildSocialMarketingViews(
  context: MetricServiceContext,
  snapshots: readonly SheetRecord[],
  performance: readonly SheetRecord[],
): {
  readonly followers: MetricViewModel;
  readonly growth: MetricSeriesViewModel;
  readonly mentions: MetricBreakdownViewModel;
  readonly table: MetricTableViewModel;
} {
  const latest = latestSocialRows(snapshots, context.dataPeriod.endDate).filter((row) =>
    SOCIAL_CHANNELS.includes(row.platform as (typeof SOCIAL_CHANNELS)[number]),
  );
  const followerValues = latest.flatMap(({ followers }) => (followers === null ? [] : [followers]));
  const followers = metric(
    context,
    "social.followers_total",
    followerValues.length
      ? { kind: "count", value: followerValues.reduce((a, b) => a + b, 0) }
      : null,
    latest.some(({ followers: value }) => value === null) ||
      new Set(latest.map(({ platform }) => platform)).size < SOCIAL_CHANNELS.length
      ? ["SOCIAL_FOLLOWER_COVERAGE_PARTIAL"]
      : [],
  );

  const monthly = new Map<string, Record<string, number>>();
  const availableMonths = [
    ...new Set(
      snapshots
        .map((row) => text(row, "snapshot_date"))
        .filter((date): date is string => date !== null && inDateRange(date, context))
        .map(month),
    ),
  ].sort();
  for (const period of availableMonths) {
    const end = `${period}-${String(new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
    const totals: Record<string, number> = {};
    for (const platform of SOCIAL_CHANNELS) {
      const values = latestSocialRows(snapshots, end)
        .filter((row) => row.platform === platform)
        .flatMap(({ followers }) => (followers === null ? [] : [followers]));
      if (values.length) totals[platform] = values.reduce((a, b) => a + b, 0);
    }
    monthly.set(period, totals);
  }
  const growthBase = metric(
    context,
    "social.follower_growth",
    monthly.size && followerValues.length
      ? { kind: "count", value: followerValues.reduce((a, b) => a + b, 0) }
      : null,
  );
  const growth = metricSeriesViewModelSchema.parse({
    metric: growthBase,
    grain: "month",
    points: [...monthly].map(([period, values]) => ({
      period,
      value: null,
      seriesValues: Object.fromEntries(
        SOCIAL_CHANNELS.map((platform) => [
          platform,
          values[platform] === undefined ? null : { kind: "count", value: values[platform] },
        ]),
      ),
    })),
  });

  const usablePerformance = performance.filter((row) =>
    overlaps(text(row, "period_start"), text(row, "period_end"), context),
  );
  const overlappingIndexes = new Set<number>();
  for (let left = 0; left < usablePerformance.length; left += 1) {
    const leftRow = usablePerformance[left];
    if (!leftRow) continue;
    for (let right = left + 1; right < usablePerformance.length; right += 1) {
      const rightRow = usablePerformance[right];
      if (!rightRow) continue;
      if (
        text(leftRow, "platform") === text(rightRow, "platform") &&
        text(leftRow, "account") === text(rightRow, "account") &&
        (text(leftRow, "period_start") ?? "") <= (text(rightRow, "period_end") ?? "") &&
        (text(rightRow, "period_start") ?? "") <= (text(leftRow, "period_end") ?? "")
      ) {
        overlappingIndexes.add(left);
        overlappingIndexes.add(right);
      }
    }
  }
  const certifiedPerformance = usablePerformance.filter(
    (_, index) => !overlappingIndexes.has(index),
  );
  const overlapWarnings = overlappingIndexes.size ? ["SOCIAL_PERFORMANCE_PERIOD_OVERLAP"] : [];
  const mentionTotals = new Map<string, number>();
  for (const row of certifiedPerformance) {
    const platform = text(row, "platform");
    const mentions = number(row, "mentions");
    if (platform && mentions !== null)
      mentionTotals.set(platform, (mentionTotals.get(platform) ?? 0) + mentions);
  }
  const mentionCount = [...mentionTotals.values()].reduce((sum, value) => sum + value, 0);
  const mentionsMetric = metric(
    context,
    "social.mentions_by_channel",
    mentionTotals.size ? { kind: "count", value: mentionCount } : null,
    overlapWarnings,
  );
  const mentions = metricBreakdownViewModelSchema.parse({
    metric: mentionsMetric,
    dimension: "platform",
    items: [...mentionTotals]
      .sort(([, left], [, right]) => right - left)
      .map(([platform, value]) => ({
        key: platform,
        label: label(platform),
        values: [{ kind: "count", value }],
        warnings: [],
      })),
  });

  const priorByKey = new Map<string, LatestSocial>();
  for (const row of snapshots) {
    const platform = text(row, "platform");
    const account = text(row, "account");
    const date = text(row, "snapshot_date");
    if (!platform || !account || !date || date >= context.dataPeriod.startDate) continue;
    const key = `${platform}:${account}`;
    if ((priorByKey.get(key)?.date ?? "") <= date) {
      priorByKey.set(key, { platform, account, date, followers: number(row, "followers") });
    }
  }
  const performanceByPlatform = new Map<
    string,
    { reach: number | null; revenue: number | null; validRevenue: boolean }
  >();
  for (const row of certifiedPerformance) {
    const platform = text(row, "platform");
    if (!platform) continue;
    const previous = performanceByPlatform.get(platform) ?? {
      reach: null,
      revenue: null,
      validRevenue: true,
    };
    const reach = number(row, "audience_reach");
    const revenue = number(row, "attributed_net_sales_usd");
    const hasAttribution =
      text(row, "attribution_source") !== null && text(row, "source_reference") !== null;
    performanceByPlatform.set(platform, {
      reach: reach === null ? previous.reach : (previous.reach ?? 0) + reach,
      revenue: revenue === null ? previous.revenue : (previous.revenue ?? 0) + revenue,
      validRevenue: previous.validRevenue && (revenue === null || hasAttribution),
    });
  }
  const tableRows = SOCIAL_CHANNELS.flatMap((platform) => {
    const channelLatest = latest.filter((row) => row.platform === platform);
    const current = channelLatest.flatMap(({ followers: value }) =>
      value === null ? [] : [value],
    );
    if (!current.length) return [];
    const currentFollowers = current.reduce((a, b) => a + b, 0);
    const prior = channelLatest.flatMap((row) => {
      const value = priorByKey.get(`${row.platform}:${row.account}`)?.followers;
      return value === null || value === undefined ? [] : [value];
    });
    const priorFollowers = prior.length ? prior.reduce((a, b) => a + b, 0) : null;
    const performanceRow = performanceByPlatform.get(platform);
    return [
      {
        channel: label(platform),
        followers: currentFollowers,
        growthRateBasisPoints:
          priorFollowers === null
            ? null
            : ratioToBasisPoints(currentFollowers - priorFollowers, priorFollowers),
        revenueMinorUnits:
          performanceRow?.validRevenue && performanceRow.revenue !== null
            ? usdFromDecimalNumber(performanceRow.revenue).minorUnits
            : null,
        audienceReach: performanceRow?.reach ?? null,
      },
    ];
  });
  const tableMetric = metric(
    context,
    "social.channel_performance",
    tableRows.length ? { kind: "status", value: `${tableRows.length} maintained channels` } : null,
    [
      ...overlapWarnings,
      ...(tableRows.some((row) => row.revenueMinorUnits === null)
        ? ["SOCIAL_REVENUE_COVERAGE_PARTIAL"]
        : []),
    ],
  );
  const table = metricTableViewModelSchema.parse({
    metric: tableMetric,
    columns: [
      "channel",
      "followers",
      "growthRateBasisPoints",
      "revenueMinorUnits",
      "audienceReach",
    ],
    rows: tableRows,
  });
  return { followers, growth, mentions, table };
}

export function buildCollaborationViews(
  context: MetricServiceContext,
  rows: readonly SheetRecord[],
): {
  readonly active: MetricViewModel;
  readonly reach: MetricBreakdownViewModel;
  readonly categories: MetricBreakdownViewModel;
  readonly table: MetricTableViewModel;
} {
  const collaborations = rows.filter((row) => text(row, "pipeline_type") === "collaboration");
  const eligible = collaborations.filter((row) => {
    const lifecycle = text(row, "collaboration_lifecycle");
    if (lifecycle === null || !COLLAB_TABLE_LIFECYCLES.has(lifecycle)) return false;
    const start =
      text(row, "collaboration_start_date") ??
      text(row, "launch_date") ??
      text(row, "created_date");
    return lifecycle === "scheduled"
      ? start !== null && start >= context.dataPeriod.startDate
      : overlaps(start, text(row, "collaboration_end_date"), context);
  });
  const activeRows = eligible.filter((row) =>
    ACTIVE_COLLAB_LIFECYCLES.has(text(row, "collaboration_lifecycle") ?? ""),
  );
  const activeIds = new Set(
    activeRows.map((row) => text(row, "record_id") ?? text(row, "opportunity")).filter(Boolean),
  );
  const active = metric(
    context,
    "collabs.active",
    collaborations.length ? { kind: "count", value: activeIds.size } : null,
  );
  const reachRows = eligible.flatMap((row) => {
    const partner = text(row, "opportunity");
    const reach = number(row, "audience_reach");
    if (!partner || reach === null) return [];
    return [{ key: text(row, "record_id") ?? partner, partner, reach, row }];
  });
  const reachMetric = metric(
    context,
    "collabs.reach",
    reachRows.length
      ? { kind: "count", value: reachRows.reduce((sum, row) => sum + row.reach, 0) }
      : null,
  );
  const reach = metricBreakdownViewModelSchema.parse({
    metric: reachMetric,
    dimension: "partner",
    items: reachRows
      .sort((left, right) => right.reach - left.reach)
      .map((row) => ({
        key: row.key,
        label: row.partner,
        values: [{ kind: "count", value: row.reach }],
        warnings: [],
      })),
  });
  const categoryTotals = new Map<string, number>();
  for (const row of eligible) {
    const category = text(row, "collaboration_category");
    if (category) categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + 1);
  }
  const categoriesMetric = metric(
    context,
    "collabs.by_category",
    categoryTotals.size ? { kind: "count", value: eligible.length } : null,
  );
  const categories = metricBreakdownViewModelSchema.parse({
    metric: categoriesMetric,
    dimension: "category",
    items: [...categoryTotals].map(([category, count]) => ({
      key: category,
      label: category,
      values: [{ kind: "count", value: count }],
      warnings: [],
    })),
  });
  const table = metricTableViewModelSchema.parse({
    metric: reachMetric,
    columns: ["partner", "category", "reach", "status", "launchDate"],
    rows: reachRows.map(({ partner, reach, row }) => ({
      partner,
      category: text(row, "collaboration_category"),
      reach,
      status: label(text(row, "collaboration_lifecycle") ?? "unknown"),
      launchDate: text(row, "launch_date"),
    })),
  });
  return { active, reach, categories, table };
}

export function buildTrafficAttributionBreakdown(
  context: MetricServiceContext,
  facts: readonly TrafficAttributionFact[],
): MetricBreakdownViewModel {
  const total = facts.reduce((sum, fact) => sum + fact.sessions, 0);
  const base = metric(
    context,
    "traffic.attribution",
    facts.length ? { kind: "count", value: total } : null,
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "provider_referrer_source",
    items: facts.slice(0, 8).map((fact) => ({
      key: fact.source,
      label: fact.source,
      values: [{ kind: "count", value: fact.sessions }],
      warnings: [],
    })),
  });
}

const canonical = (value: string | null) => value?.trim().toLowerCase() ?? null;
const utmKey = (source: string | null, campaign: string | null, content: string | null) =>
  JSON.stringify([canonical(source), canonical(campaign), canonical(content)]);

export function buildAffiliateMarketingViews(
  context: MetricServiceContext,
  rows: readonly SheetRecord[],
  sessionFacts: readonly AffiliateSessionFact[],
  salesFacts: readonly AffiliateSalesFact[],
): {
  readonly active: MetricViewModel;
  readonly sessions: MetricViewModel;
  readonly revenue: MetricViewModel;
  readonly table: MetricTableViewModel;
  readonly roi: MetricBreakdownViewModel;
} {
  const applicable = rows.filter((row) => {
    const period = text(row, "period");
    const start = period ? `${period}-01` : null;
    const end = period
      ? `${period}-${String(new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`
      : null;
    return overlaps(start, end, context) && text(row, "payout_status") !== "cancelled";
  });
  const ambassadors = applicable.filter((row) => text(row, "partner_type") === "ambassador");
  const activeIds = new Set(
    ambassadors
      .filter((row) => (number(row, "clicks") ?? 0) > 0)
      .map((row) => text(row, "partner_id"))
      .filter(Boolean),
  );
  const active = metric(
    context,
    "ambassadors.active",
    ambassadors.length ? { kind: "count", value: activeIds.size } : null,
  );

  const utmMappings = new Map<string, SheetRecord[]>();
  const codeMappings = new Map<string, SheetRecord[]>();
  for (const row of ambassadors) {
    const key = utmKey(
      text(row, "utm_source"),
      text(row, "utm_campaign"),
      text(row, "utm_content"),
    );
    if (key !== "[null,null,null]") utmMappings.set(key, [...(utmMappings.get(key) ?? []), row]);
    const code = canonical(text(row, "shopify_discount_code"));
    if (code) codeMappings.set(code, [...(codeMappings.get(code) ?? []), row]);
  }
  const ambiguousUtms = new Set(
    [...utmMappings]
      .filter(([, mapped]) => new Set(mapped.map((row) => text(row, "partner_id"))).size > 1)
      .map(([key]) => key),
  );
  const ambiguousCodes = new Set(
    [...codeMappings]
      .filter(([, mapped]) => new Set(mapped.map((row) => text(row, "partner_id"))).size > 1)
      .map(([key]) => key),
  );
  const joinWarnings = [
    ...(ambiguousUtms.size ? ["AFFILIATE_UTM_MAPPING_CONFLICT"] : []),
    ...(ambiguousCodes.size ? ["AFFILIATE_CODE_MAPPING_CONFLICT"] : []),
    ...(ambassadors.some(
      (row) =>
        utmKey(text(row, "utm_source"), text(row, "utm_campaign"), text(row, "utm_content")) ===
          "[null,null,null]" || canonical(text(row, "shopify_discount_code")) === null,
    )
      ? ["AFFILIATE_MAPPING_COVERAGE_PARTIAL"]
      : []),
  ];
  const matchedSessions = sessionFacts.reduce((sum, fact) => {
    const key = utmKey(fact.utmSource, fact.utmCampaign, fact.utmContent);
    return sum + (utmMappings.has(key) && !ambiguousUtms.has(key) ? fact.sessions : 0);
  }, 0);
  const sessions = metric(
    context,
    "ambassadors.sessions",
    ambiguousUtms.size || utmMappings.size === 0 ? null : { kind: "count", value: matchedSessions },
    joinWarnings,
  );
  const salesByPartner = new Map<string, { orders: number; revenue: number }>();
  for (const fact of salesFacts) {
    const code = canonical(fact.discountCode);
    const mapped = code ? codeMappings.get(code) : undefined;
    const row = code && mapped && !ambiguousCodes.has(code) ? mapped[0] : undefined;
    const partnerId = row ? text(row, "partner_id") : null;
    if (!partnerId) continue;
    const previous = salesByPartner.get(partnerId) ?? { orders: 0, revenue: 0 };
    salesByPartner.set(partnerId, {
      orders: previous.orders + fact.orders,
      revenue: previous.revenue + fact.netSalesMinorUnits,
    });
  }
  const revenueMinorUnits = [...salesByPartner.values()].reduce(
    (sum, value) => sum + value.revenue,
    0,
  );
  const revenue = metric(
    context,
    "ambassadors.revenue",
    ambiguousCodes.size || codeMappings.size === 0
      ? null
      : { kind: "money", value: usd(revenueMinorUnits) },
    joinWarnings,
  );
  const tableRows = ambassadors
    .map((row) => {
      const partnerId = text(row, "partner_id") ?? "";
      const matched = salesByPartner.get(partnerId);
      const code = text(row, "shopify_discount_code") ?? text(row, "code_or_link") ?? "Unmapped";
      const commission = number(row, "commission_usd");
      return {
        ambassador: text(row, "partner_name") ?? partnerId,
        code,
        clicks: number(row, "clicks"),
        orders: matched?.orders ?? null,
        revenueMinorUnits: matched?.revenue ?? null,
        commissionMinorUnits:
          commission === null ? null : usdFromDecimalNumber(commission).minorUnits,
      };
    })
    .sort((left, right) => (right.revenueMinorUnits ?? -1) - (left.revenueMinorUnits ?? -1));
  const tableMetric = metric(
    context,
    "ambassadors.top",
    tableRows.length ? { kind: "status", value: `${tableRows.length} ambassador rows` } : null,
    [
      ...joinWarnings,
      ...(tableRows.some((row) => row.commissionMinorUnits === null)
        ? ["AMBASSADOR_COMMISSION_COVERAGE_PARTIAL"]
        : []),
    ],
  );
  const table = metricTableViewModelSchema.parse({
    metric: tableMetric,
    columns: [
      "ambassador",
      "code",
      "clicks",
      "orders",
      "revenueMinorUnits",
      "commissionMinorUnits",
    ],
    rows: tableRows,
  });
  const roiMetric = metric(context, "marketing.affiliate_roi_message", null);
  const roi = metricBreakdownViewModelSchema.parse({
    metric: roiMetric,
    dimension: "message_category",
    items: [],
  });
  return { active, sessions, revenue, table, roi };
}

export function buildBlockedCampaignRoi(context: MetricServiceContext): MetricBreakdownViewModel {
  const base = metric(context, "marketing.campaign_roi", null);
  return metricBreakdownViewModelSchema.parse({ metric: base, dimension: "campaign", items: [] });
}

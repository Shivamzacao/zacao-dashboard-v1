import type { SheetRecord } from "@/src/application/ports/sheets-tabs";
import {
  metricBreakdownViewModelSchema,
  metricSeriesViewModelSchema,
  metricTableViewModelSchema,
  type MetricBreakdownViewModel,
  type MetricSeriesViewModel,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import { usdFromDecimalNumber } from "@/src/domain/metrics/calculations";
import { ratioToBasisPoints } from "@/src/domain/utilities/money";
import type { AffiliateSalesFact, MetricServiceContext } from "./types";
import { createMetricViewModel } from "./view-model";

const COMMERCIAL_TYPES = new Set(["retail", "collaboration", "partnership", "commercial"]);
const PARTNER_TYPES = new Set(["affiliate", "ambassador"]);
const SOCIAL_CHANNELS = new Set(["instagram", "tiktok", "youtube"]);
const GRANT_DECISIONS = new Set(["awarded", "rejected"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (row: SheetRecord, key: string): string | null => {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const number = (row: SheetRecord, key: string): number | null => {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const canonical = (value: string | null): string | null => value?.trim().toLowerCase() || null;

const label = (value: string): string =>
  value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const validDate = (value: string | null): value is string => {
  if (!value || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

function metric(
  context: MetricServiceContext,
  metricKey: string,
  value: Parameters<typeof createMetricViewModel>[0]["value"],
  warnings: readonly string[] = [],
): MetricViewModel {
  return createMetricViewModel({
    metricKey,
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: context.sourceStatuses,
    value,
    warnings,
  });
}

function usdValue(value: number | null) {
  return value === null ? null : ({ kind: "money", value: usdFromDecimalNumber(value) } as const);
}

function quantityValue(value: number | null) {
  return value === null ? null : ({ kind: "quantity", value } as const);
}

function countValue(value: number | null) {
  return value === null ? null : ({ kind: "count", value } as const);
}

function usdMinorUnits(row: SheetRecord, key: string): number | null {
  const value = number(row, key);
  return value === null ? null : usdFromDecimalNumber(value).minorUnits;
}

function periodBounds(period: string | null): { start: string; end: string } | null {
  const match = period?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${period}-01`, end: `${period}-${String(endDay).padStart(2, "0")}` };
}

function overlapsPeriod(row: SheetRecord, context: MetricServiceContext): boolean {
  const bounds = periodBounds(text(row, "period"));
  return (
    bounds !== null &&
    bounds.start <= context.dataPeriod.endDate &&
    bounds.end >= context.dataPeriod.startDate
  );
}

function latestSnapshots(
  rows: readonly SheetRecord[],
  idField: string,
  endDate: string,
): { rows: readonly SheetRecord[]; warnings: readonly string[] } {
  const latest = new Map<string, { date: string; rows: SheetRecord[] }>();
  let invalid = 0;
  for (const row of rows) {
    const id = text(row, idField);
    const date = text(row, "snapshot_date");
    if (!id || !validDate(date)) {
      invalid += 1;
      continue;
    }
    if (date > endDate) continue;
    const prior = latest.get(id);
    if (!prior || prior.date < date) latest.set(id, { date, rows: [row] });
    else if (prior.date === date) prior.rows.push(row);
  }
  const conflicts = [...latest.values()].filter(({ rows: matches }) => matches.length > 1).length;
  return {
    rows: [...latest.values()].flatMap(({ rows: matches }) =>
      matches.length === 1 ? matches : [],
    ),
    warnings: [
      ...(invalid ? ["GROWTH_SNAPSHOT_KEY_OR_DATE_INVALID"] : []),
      ...(conflicts ? ["GROWTH_SNAPSHOT_CONFLICT"] : []),
    ],
  };
}

function growthCategory(row: SheetRecord): string {
  const category = canonical(text(row, "growth_category"));
  const approved: Readonly<Record<string, string>> = {
    wholesale: "Wholesale",
    ambassador: "Ambassador",
    corporate_gifting: "Corporate gifting",
    retail_media: "Retail media",
  };
  return category ? (approved[category] ?? "Unclassified") : "Unclassified";
}

function isCommercial(row: SheetRecord): boolean {
  const type = canonical(text(row, "pipeline_type"));
  return type !== "investor" && type !== "grant" && (type === null || COMMERCIAL_TYPES.has(type));
}

export function buildGrowthPipelineMetrics(
  context: MetricServiceContext,
  records: readonly SheetRecord[],
  targets: readonly SheetRecord[],
): {
  readonly metrics: readonly MetricViewModel[];
  readonly byType: MetricBreakdownViewModel;
  readonly weightedByIndustry: MetricBreakdownViewModel;
  readonly nextActions: MetricTableViewModel;
} {
  const selected = latestSnapshots(records, "opportunity_id", context.dataPeriod.endDate);
  const commercial = selected.rows.filter(isCommercial);
  const open = commercial.filter((row) => canonical(text(row, "status")) === "open");
  const won = commercial.filter((row) => canonical(text(row, "status")) === "won");
  const values = open.flatMap((row) => {
    const value = number(row, "value_usd");
    return value === null ? [] : [value];
  });
  const openWarnings = [
    ...selected.warnings,
    ...(open.some((row) => number(row, "value_usd") === null)
      ? ["OPEN_PIPELINE_VALUE_COVERAGE_PARTIAL"]
      : []),
  ];
  const openCount = metric(
    context,
    "growth.open_pipeline",
    open.length ? countValue(open.length) : null,
    selected.warnings,
  );
  const openValue = metric(
    context,
    "growth.open_pipeline_value",
    values.length ? usdValue(values.reduce((sum, value) => sum + value, 0)) : null,
    openWarnings,
  );

  const closedEligible = won.filter((row) => {
    const signed = text(row, "signed_date");
    return validDate(signed) && signed <= context.dataPeriod.endDate;
  });
  const closedValues = closedEligible.flatMap((row) => {
    const value = number(row, "actual_value_usd");
    return value === null ? [] : [value];
  });
  const closed = metric(
    context,
    "growth.closed_pipeline",
    closedValues.length ? usdValue(closedValues.reduce((sum, value) => sum + value, 0)) : null,
    [
      ...selected.warnings,
      ...(closedEligible.some((row) => number(row, "actual_value_usd") === null)
        ? ["CLOSED_PIPELINE_VALUE_COVERAGE_PARTIAL"]
        : []),
    ],
  );

  const weightedRows = open.flatMap((row) => {
    const value = number(row, "value_usd");
    const probability = number(row, "probability_manual");
    if (value === null || probability === null || probability < 0 || probability > 1) return [];
    return [{ row, value: value * probability }];
  });
  const weightedTotal = weightedRows.reduce((sum, row) => sum + row.value, 0);
  const weightedWarnings = [
    ...selected.warnings,
    ...(weightedRows.length < open.length ? ["WEIGHTED_PIPELINE_COVERAGE_PARTIAL"] : []),
  ];
  const weighted = metric(
    context,
    "growth.weighted_pipeline",
    weightedRows.length ? usdValue(weightedTotal) : null,
    weightedWarnings,
  );

  const closeMonths = won.flatMap((row) => {
    const firstContact = text(row, "first_contact_date");
    const signed = text(row, "signed_date");
    if (
      !validDate(firstContact) ||
      !validDate(signed) ||
      signed < context.dataPeriod.startDate ||
      signed > context.dataPeriod.endDate ||
      signed < firstContact
    )
      return [];
    const days =
      (new Date(`${signed}T00:00:00.000Z`).valueOf() -
        new Date(`${firstContact}T00:00:00.000Z`).valueOf()) /
      86_400_000;
    return [days / 30.4375];
  });
  const signedInPeriod = won.filter((row) => {
    const signed = text(row, "signed_date");
    return (
      validDate(signed) &&
      signed >= context.dataPeriod.startDate &&
      signed <= context.dataPeriod.endDate
    );
  });
  const timeToClose = metric(
    context,
    "growth.time_to_close",
    closeMonths.length
      ? quantityValue(
          Math.round(
            (closeMonths.reduce((sum, value) => sum + value, 0) / closeMonths.length) * 10,
          ) / 10,
        )
      : null,
    [
      ...selected.warnings,
      ...(closeMonths.length < signedInPeriod.length ? ["CLOSE_TIME_COVERAGE_PARTIAL"] : []),
    ],
  );

  const targetRows = targets.filter((row) => {
    const start = text(row, "period_start");
    const end = text(row, "period_end");
    return (
      text(row, "metric_key") === "growth.time_to_close_target" &&
      text(row, "unit") === "months" &&
      text(row, "scope_type") === "company" &&
      canonical(text(row, "status")) === "active" &&
      validDate(start) &&
      validDate(end) &&
      start <= context.dataPeriod.endDate &&
      end >= context.dataPeriod.endDate
    );
  });
  const targetRow = targetRows.length === 1 ? targetRows[0] : undefined;
  const targetValue = targetRow ? number(targetRow, "target_value") : null;
  const target = metric(
    context,
    "growth.time_to_close_target",
    quantityValue(targetValue),
    targetRows.length > 1 ? ["TIME_TO_CLOSE_TARGET_CONFLICT"] : [],
  );

  const byTypeMetric = metric(
    context,
    "growth.pipeline_by_type",
    open.length ? countValue(open.length) : null,
    selected.warnings,
  );
  const typeCounts = new Map<string, number>();
  for (const row of open) {
    const category = growthCategory(row);
    typeCounts.set(category, (typeCounts.get(category) ?? 0) + 1);
  }
  const byType = metricBreakdownViewModelSchema.parse({
    metric: byTypeMetric,
    dimension: "growth_category",
    items: [...typeCounts].map(([category, count]) => ({
      key: category.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_"),
      label: category,
      values: [{ kind: "count", value: count }],
      warnings: [],
    })),
  });

  const industryTotals = new Map<string, number>();
  for (const { row, value } of weightedRows) {
    const industry = text(row, "industry") ?? "Unclassified";
    industryTotals.set(industry, (industryTotals.get(industry) ?? 0) + value);
  }
  const weightedByIndustry = metricBreakdownViewModelSchema.parse({
    metric: metric(
      context,
      "growth.weighted_by_industry",
      weightedRows.length ? usdValue(weightedTotal) : null,
      weightedWarnings,
    ),
    dimension: "industry",
    items: [...industryTotals]
      .sort(([, left], [, right]) => right - left)
      .map(([industry, value]) => ({
        key: industry.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_"),
        label: industry,
        values: [{ kind: "money", value: usdFromDecimalNumber(value) }],
        warnings: [],
      })),
  });

  const nextRows = open
    .filter((row) => text(row, "next_action") !== null)
    .sort(
      (left, right) =>
        (text(left, "next_action_date") ?? "9999-12-31").localeCompare(
          text(right, "next_action_date") ?? "9999-12-31",
        ) || (text(left, "opportunity") ?? "").localeCompare(text(right, "opportunity") ?? ""),
    )
    .map((row) => ({
      pipelineType: text(row, "pipeline_type"),
      opportunityId: text(row, "opportunity_id"),
      opportunityName: text(row, "opportunity"),
      stage: text(row, "stage"),
      status: text(row, "status"),
      nextAction: text(row, "next_action"),
      dueDate: text(row, "next_action_date"),
      valueMinorUnits: usdMinorUnits(row, "value_usd"),
    }));
  const nextActions = metricTableViewModelSchema.parse({
    metric: metric(
      context,
      "growth.next_actions",
      nextRows.length && nextRows[0]?.dueDate ? { kind: "date", value: nextRows[0].dueDate } : null,
      selected.warnings,
    ),
    columns: [
      "pipelineType",
      "opportunityId",
      "opportunityName",
      "stage",
      "status",
      "nextAction",
      "dueDate",
      "valueMinorUnits",
    ],
    rows: nextRows,
  });

  return {
    metrics: [openCount, openValue, closed, weighted, timeToClose, target],
    byType,
    weightedByIndustry,
    nextActions,
  };
}

interface SocialSnapshot {
  readonly platform: string;
  readonly account: string;
  readonly date: string;
  readonly followers: number;
}

function socialAsOf(rows: readonly SheetRecord[], endDate: string): readonly SocialSnapshot[] {
  const latest = new Map<string, SocialSnapshot>();
  for (const row of rows) {
    const platform = canonical(text(row, "platform"));
    const account = text(row, "account");
    const date = text(row, "snapshot_date");
    const followers = number(row, "followers");
    if (
      !platform ||
      !SOCIAL_CHANNELS.has(platform) ||
      !account ||
      !validDate(date) ||
      date > endDate ||
      followers === null
    )
      continue;
    const key = `${platform}:${account}`;
    if ((latest.get(key)?.date ?? "") <= date)
      latest.set(key, { platform, account, date, followers });
  }
  return [...latest.values()];
}

export function buildGrowthSocialViews(
  context: MetricServiceContext,
  records: readonly SheetRecord[],
): { readonly metric: MetricViewModel; readonly series: MetricSeriesViewModel } {
  const latest = socialAsOf(records, context.dataPeriod.endDate);
  const total = latest.reduce((sum, row) => sum + row.followers, 0);
  const platforms = new Set(latest.map((row) => row.platform));
  const warnings =
    platforms.size < SOCIAL_CHANNELS.size ? ["SOCIAL_FOLLOWER_COVERAGE_PARTIAL"] : [];
  const socialMetric = metric(
    context,
    "social.performance",
    latest.length ? countValue(total) : null,
    warnings,
  );
  const months = [
    ...new Set(
      records
        .map((row) => text(row, "snapshot_date"))
        .filter(
          (date): date is string =>
            validDate(date) &&
            date >= context.dataPeriod.startDate &&
            date <= context.dataPeriod.endDate,
        )
        .map((date) => date.slice(0, 7)),
    ),
  ].sort();
  return {
    metric: socialMetric,
    series: metricSeriesViewModelSchema.parse({
      metric: socialMetric,
      grain: "month",
      points: months.map((month) => {
        const lastDay = new Date(
          Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
        ).getUTCDate();
        const monthRows = socialAsOf(records, `${month}-${String(lastDay).padStart(2, "0")}`);
        return {
          period: month,
          value: countValue(monthRows.reduce((sum, row) => sum + row.followers, 0)),
        };
      }),
    }),
  };
}

export function buildGrowthPartnerViews(
  context: MetricServiceContext,
  records: readonly SheetRecord[],
  salesFacts: readonly AffiliateSalesFact[],
): {
  readonly metric: MetricViewModel;
  readonly breakdown: MetricBreakdownViewModel;
  readonly table: MetricTableViewModel;
} {
  const applicable = records.filter(
    (row) => overlapsPeriod(row, context) && canonical(text(row, "payout_status")) !== "cancelled",
  );
  const codeRows = new Map<string, SheetRecord[]>();
  for (const row of applicable.filter((candidate) =>
    PARTNER_TYPES.has(canonical(text(candidate, "partner_type")) ?? ""),
  )) {
    const code = canonical(text(row, "shopify_discount_code"));
    if (code) codeRows.set(code, [...(codeRows.get(code) ?? []), row]);
  }
  const ambiguousCodes = new Set(
    [...codeRows]
      .filter(([, rows]) => new Set(rows.map((row) => text(row, "partner_id"))).size > 1)
      .map(([code]) => code),
  );
  const salesByCode = new Map(
    salesFacts.flatMap((fact) => {
      const code = canonical(fact.discountCode);
      return code ? [[code, fact] as const] : [];
    }),
  );
  const rows = applicable.map((row) => {
    const type = canonical(text(row, "partner_type"));
    const code = canonical(text(row, "shopify_discount_code"));
    const sourceDriven = type !== null && PARTNER_TYPES.has(type);
    const sale =
      sourceDriven && code && !ambiguousCodes.has(code) ? salesByCode.get(code) : undefined;
    const hasManualAttribution =
      text(row, "attribution_source") !== null && text(row, "source_reference") !== null;
    const manualRevenue = usdMinorUnits(row, "revenue_usd");
    const revenue = sourceDriven
      ? sale
        ? sale.netSalesMinorUnits
        : null
      : hasManualAttribution
        ? manualRevenue
        : null;
    const orders = sourceDriven
      ? sale
        ? sale.orders
        : null
      : hasManualAttribution
        ? number(row, "orders")
        : null;
    return {
      periodStart: periodBounds(text(row, "period"))?.start ?? null,
      periodEnd: periodBounds(text(row, "period"))?.end ?? null,
      partnerType: type ? label(type) : null,
      partner: text(row, "partner_name"),
      platform: text(row, "platform"),
      orders,
      revenueMinorUnits: revenue,
      commissionMinorUnits: usdMinorUnits(row, "commission_usd"),
      payoutStatus: text(row, "payout_status"),
    };
  });
  const validRows = rows.flatMap((row) =>
    row.partner && row.revenueMinorUnits !== null
      ? [{ ...row, partner: row.partner, revenueMinorUnits: row.revenueMinorUnits }]
      : [],
  );
  const totalMinor = validRows.reduce((sum, row) => sum + (row.revenueMinorUnits ?? 0), 0);
  const warnings = [
    ...(ambiguousCodes.size ? ["PARTNER_CODE_MAPPING_CONFLICT"] : []),
    ...(validRows.length < rows.length ? ["PARTNER_REVENUE_COVERAGE_PARTIAL"] : []),
    ...(rows.some((row) => row.commissionMinorUnits === null)
      ? ["PARTNER_COMMISSION_COVERAGE_PARTIAL"]
      : []),
  ];
  const partnerMetric = metric(
    context,
    "partners.performance",
    validRows.length ? { kind: "money", value: { currency: "USD", minorUnits: totalMinor } } : null,
    warnings,
  );
  return {
    metric: partnerMetric,
    breakdown: metricBreakdownViewModelSchema.parse({
      metric: partnerMetric,
      dimension: "partner",
      items: validRows
        .sort((left, right) => (right.revenueMinorUnits ?? 0) - (left.revenueMinorUnits ?? 0))
        .map((row) => ({
          key: row.partner,
          label: row.partner,
          values: [
            { kind: "money", value: { currency: "USD", minorUnits: row.revenueMinorUnits } },
          ],
          warnings: [],
        })),
    }),
    table: metricTableViewModelSchema.parse({
      metric: partnerMetric,
      columns: [
        "periodStart",
        "periodEnd",
        "partnerType",
        "partner",
        "platform",
        "orders",
        "revenueMinorUnits",
        "commissionMinorUnits",
        "payoutStatus",
      ],
      rows,
    }),
  };
}

export function buildInvestorViews(
  context: MetricServiceContext,
  records: readonly SheetRecord[],
): { readonly metric: MetricViewModel; readonly table: MetricTableViewModel } {
  const selected = latestSnapshots(records, "investor_id", context.dataPeriod.endDate);
  const active = selected.rows
    .filter((row) => canonical(text(row, "status")) === "active")
    .sort(
      (left, right) =>
        (number(left, "display_priority") ?? Number.MAX_SAFE_INTEGER) -
          (number(right, "display_priority") ?? Number.MAX_SAFE_INTEGER) ||
        (text(left, "investor") ?? "").localeCompare(text(right, "investor") ?? ""),
    );
  const investorMetric = metric(
    context,
    "investors.count",
    active.length ? countValue(active.length) : null,
    selected.warnings,
  );
  const tableMetric = metric(
    context,
    "investors.pipeline",
    active.length ? { kind: "status", value: `${active.length} active investors` } : null,
    selected.warnings,
  );
  return {
    metric: investorMetric,
    table: metricTableViewModelSchema.parse({
      metric: tableMetric,
      columns: ["investor", "stage", "interestLevel", "checkSizeMinorUnits", "nextStep"],
      rows: active.map((row) => ({
        investor: text(row, "investor"),
        stage: text(row, "stage"),
        interestLevel: number(row, "interest_level"),
        checkSizeMinorUnits: usdMinorUnits(row, "check_size_usd"),
        nextStep: text(row, "next_step"),
      })),
    }),
  };
}

export function buildGrantViews(
  context: MetricServiceContext,
  records: readonly SheetRecord[],
): {
  readonly secured: MetricViewModel;
  readonly submitted: MetricViewModel;
  readonly acceptance: MetricViewModel;
  readonly rolling: MetricBreakdownViewModel;
  readonly table: MetricTableViewModel;
} {
  const asOf = records.filter((row) => {
    const submitted = text(row, "submitted_date");
    return validDate(submitted) && submitted <= context.dataPeriod.endDate;
  });
  const decided = asOf.filter((row) => {
    const status = canonical(text(row, "status"));
    const date = text(row, "decision_date");
    return (
      status !== null &&
      GRANT_DECISIONS.has(status) &&
      validDate(date) &&
      date <= context.dataPeriod.endDate
    );
  });
  const awarded = decided.filter((row) => canonical(text(row, "status")) === "awarded");
  const awards = awarded.flatMap((row) => {
    const value = number(row, "awarded_amount_usd");
    return value === null ? [] : [value];
  });
  const secured = metric(
    context,
    "grants.secured",
    awards.length ? usdValue(awards.reduce((sum, value) => sum + value, 0)) : null,
    awarded.some((row) => number(row, "awarded_amount_usd") === null)
      ? ["GRANT_AWARD_COVERAGE_PARTIAL"]
      : [],
  );
  const submitted = metric(
    context,
    "grants.submitted",
    asOf.length ? countValue(asOf.length) : null,
  );
  const acceptance = metric(
    context,
    "grants.acceptance_rate",
    decided.length
      ? {
          kind: "rate_basis_points",
          value: ratioToBasisPoints(awarded.length, decided.length) ?? 0,
        }
      : null,
  );
  const end = new Date(`${context.dataPeriod.endDate}T00:00:00.000Z`);
  const startForDays = (days: number) =>
    new Date(end.valueOf() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const ytd = `${context.dataPeriod.endDate.slice(0, 4)}-01-01`;
  const rollingValues: readonly [string, string, string][] = [
    ["past_week", "Past week", startForDays(7)],
    ["past_month", "Past month", startForDays(30)],
    ["ytd", "YTD", ytd],
  ];
  const rolling = metricBreakdownViewModelSchema.parse({
    metric: metric(context, "grants.rolling", asOf.length ? countValue(asOf.length) : null),
    dimension: "window",
    items: rollingValues.map(([key, display, start]) => ({
      key,
      label: display,
      values: [
        {
          kind: "count",
          value: asOf.filter((row) => (text(row, "submitted_date") ?? "") >= start).length,
        },
      ],
      warnings: [],
    })),
  });
  const table = metricTableViewModelSchema.parse({
    metric: submitted,
    columns: ["grant", "submittedDate", "requestedAmountMinorUnits", "status"],
    rows: asOf
      .sort((left, right) =>
        (text(right, "submitted_date") ?? "").localeCompare(text(left, "submitted_date") ?? ""),
      )
      .map((row) => {
        const status = text(row, "status");
        return {
          grant: text(row, "grant"),
          submittedDate: text(row, "submitted_date"),
          requestedAmountMinorUnits: usdMinorUnits(row, "requested_amount_usd"),
          status: status ? label(status) : null,
        };
      }),
  });
  return { secured, submitted, acceptance, rolling, table };
}

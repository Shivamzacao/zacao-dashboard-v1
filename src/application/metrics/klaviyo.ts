import {
  metricSeriesViewModelSchema,
  metricBreakdownViewModelSchema,
  metricTableViewModelSchema,
  type MetricBreakdownViewModel,
  type MetricSeriesViewModel,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import { usd } from "@/src/domain/utilities/money";
import { ratioToBasisPoints } from "@/src/domain/utilities/money";

import type {
  KlaviyoPerformanceFact,
  KlaviyoDemographicFact,
  KlaviyoPerformanceRow,
  KlaviyoSmsFact,
  KlaviyoTrendPoint,
  MetricServiceContext,
} from "./types";
import { createMetricViewModel } from "./view-model";

function metric(
  context: MetricServiceContext,
  metricKey: string,
  value: Parameters<typeof createMetricViewModel>[0]["value"],
  warnings: readonly string[] = [],
  timeSemantics: "send_date" | "event_time" = "send_date",
): MetricViewModel {
  return createMetricViewModel({
    metricKey,
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: context.sourceStatuses,
    value,
    warnings: [
      timeSemantics === "send_date"
        ? "KLAVIYO_SEND_DATE_SEMANTICS"
        : "KLAVIYO_EVENT_TIME_SEMANTICS",
      ...warnings,
    ],
  });
}

function countValue(value: number | null) {
  return value === null ? null : ({ kind: "count", value } as const);
}

function rateValue(value: number | null) {
  return value === null ? null : ({ kind: "rate_basis_points", value } as const);
}

function demographicMetric(
  context: MetricServiceContext,
  metricKey: "customers.age_mix" | "customers.sex_mix",
  value: number | null,
  warnings: readonly string[],
) {
  return createMetricViewModel({
    metricKey,
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: context.sourceStatuses,
    value: rateValue(value),
    warnings,
  });
}

export function buildKlaviyoDemographicBreakdowns(
  context: MetricServiceContext,
  fact: KlaviyoDemographicFact | null,
): readonly MetricBreakdownViewModel[] {
  const sharedWarnings = ["KLAVIYO_PROFILE_SNAPSHOT"];
  const ageWarnings = [
    ...sharedWarnings,
    ...(fact && fact.declaredAgeProfiles < fact.totalProfiles
      ? ["KLAVIYO_AGE_COVERAGE_PARTIAL"]
      : []),
    ...(fact?.invalidAgeProfiles ? ["KLAVIYO_AGE_VALUES_EXCLUDED"] : []),
  ];
  const ageMetric = demographicMetric(
    context,
    "customers.age_mix",
    fact && fact.declaredAgeProfiles > 0 ? 10_000 : null,
    ageWarnings,
  );
  const genderMetric = demographicMetric(
    context,
    "customers.sex_mix",
    fact && fact.totalProfiles > 0 ? 10_000 : null,
    sharedWarnings,
  );
  return [
    metricBreakdownViewModelSchema.parse({
      metric: ageMetric,
      dimension: "age_band",
      items: (fact?.ageBands ?? []).flatMap(({ label, profiles }) => {
        const share = ratioToBasisPoints(profiles, fact?.declaredAgeProfiles ?? 0);
        return profiles > 0 && share !== null
          ? [
              {
                key: label,
                label,
                values: [{ kind: "rate_basis_points", value: share }],
                warnings: [],
              },
            ]
          : [];
      }),
    }),
    metricBreakdownViewModelSchema.parse({
      metric: genderMetric,
      dimension: "gender",
      items: (fact?.genders ?? []).flatMap(({ label, profiles }) => {
        const share = ratioToBasisPoints(profiles, fact?.totalProfiles ?? 0);
        return share === null
          ? []
          : [
              {
                key: label,
                label,
                values: [{ kind: "rate_basis_points", value: share }],
                warnings: [],
              },
            ];
      }),
    }),
  ];
}

export function buildKlaviyoEmailOverview(
  context: MetricServiceContext,
  fact: KlaviyoPerformanceFact | null,
): readonly MetricViewModel[] {
  return [
    metric(context, "klaviyo.email_overview", rateValue(fact?.openRateBasisPoints ?? null)),
    metric(context, "klaviyo.email_recipients", countValue(fact?.recipients ?? null)),
    metric(
      context,
      "klaviyo.email_delivery_rate",
      rateValue(fact?.deliveryRateBasisPoints ?? null),
    ),
    metric(context, "klaviyo.email_open_rate", rateValue(fact?.openRateBasisPoints ?? null)),
    metric(context, "klaviyo.email_click_rate", rateValue(fact?.clickRateBasisPoints ?? null)),
    metric(
      context,
      "klaviyo.email_click_to_open_rate",
      rateValue(fact?.clickToOpenRateBasisPoints ?? null),
    ),
    metric(context, "klaviyo.email_bounce_rate", rateValue(fact?.bounceRateBasisPoints ?? null)),
    metric(
      context,
      "klaviyo.email_unsubscribe_rate",
      rateValue(fact?.unsubscribeRateBasisPoints ?? null),
    ),
    metric(context, "klaviyo.email_spam_complaints", countValue(fact?.spamComplaints ?? null)),
    metric(
      context,
      "klaviyo.attributed_revenue",
      fact?.conversionValueMinorUnits === null || fact?.conversionValueMinorUnits === undefined
        ? null
        : { kind: "money", value: usd(fact.conversionValueMinorUnits) },
      ["KLAVIYO_ATTRIBUTED_REVENUE_NOT_COMPANY_REVENUE"],
    ),
  ];
}

export function buildKlaviyoSmsOverview(
  context: MetricServiceContext,
  fact: KlaviyoSmsFact | null,
): readonly MetricViewModel[] {
  const timeSemantics = fact?.measurementLabel === "event_time" ? "event_time" : "send_date";
  return [
    metric(context, "klaviyo.sms_overview", countValue(fact?.sent ?? null), [], timeSemantics),
    metric(context, "klaviyo.sms_sent", countValue(fact?.sent ?? null), [], timeSemantics),
    metric(
      context,
      "klaviyo.sms_delivered",
      countValue(fact?.deliveredOrReceived ?? null),
      [],
      timeSemantics,
    ),
    metric(context, "klaviyo.sms_clicked", countValue(fact?.clicked ?? null), [], timeSemantics),
    metric(context, "klaviyo.sms_failed", countValue(fact?.failed ?? null), [], timeSemantics),
    metric(
      context,
      "klaviyo.sms_unsubscribed",
      countValue(fact?.unsubscribed ?? null),
      [],
      timeSemantics,
    ),
  ];
}

export function buildKlaviyoPerformanceTable(
  context: MetricServiceContext,
  type: "campaign" | "flow",
  rows: readonly KlaviyoPerformanceRow[],
): MetricTableViewModel {
  const metricKey =
    type === "campaign" ? "klaviyo.campaign_performance" : "klaviyo.flow_performance";
  const base = metric(
    context,
    metricKey,
    rows.length === 0
      ? null
      : { kind: "status", value: `${rows.length} report row${rows.length === 1 ? "" : "s"}` },
  );
  return metricTableViewModelSchema.parse({
    metric: base,
    columns: [
      "id",
      "name",
      "channel",
      "recipients",
      "deliveryRateBasisPoints",
      "openRateBasisPoints",
      "clickRateBasisPoints",
      "conversions",
      "conversionValueMinorUnits",
    ],
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      channel: row.channel,
      recipients: row.recipients,
      deliveryRateBasisPoints: row.deliveryRateBasisPoints,
      openRateBasisPoints: row.openRateBasisPoints,
      clickRateBasisPoints: row.clickRateBasisPoints,
      conversions: row.conversions,
      conversionValueMinorUnits: row.conversionValueMinorUnits,
    })),
  });
}

export function buildKlaviyoEngagementSeries(
  context: MetricServiceContext,
  grain: "hour" | "day" | "week" | "month",
  points: readonly KlaviyoTrendPoint[],
): MetricSeriesViewModel {
  const base = createMetricViewModel({
    metricKey: "klaviyo.engagement_trend",
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: context.sourceStatuses,
    value:
      points.length === 0
        ? null
        : {
            kind: "count",
            value: points.reduce((total, point) => total + (point.count ?? 0), 0),
          },
    warnings: ["KLAVIYO_EVENT_TIME_SEMANTICS"],
  });
  return metricSeriesViewModelSchema.parse({
    metric: base,
    grain,
    points: points.map((point) => ({
      period: point.period,
      value: point.count === null ? null : { kind: "count", value: point.count },
    })),
  });
}

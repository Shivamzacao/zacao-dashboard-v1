import {
  metricBreakdownViewModelSchema,
  metricTableViewModelSchema,
  type MetricBreakdownViewModel,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import {
  dateWithinRange,
  sumFiniteNumbers,
  usdFromDecimalNumber,
} from "@/src/domain/metrics/calculations";
import { addUsd } from "@/src/domain/utilities/money";
import type { ManualMetricRecord, ManualWorkbookFacts, MetricServiceContext } from "./types";
import { createMetricViewModel } from "./view-model";

function text(record: ManualMetricRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function number(record: ManualMetricRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function inPeriod(record: ManualMetricRecord, key: string, context: MetricServiceContext): boolean {
  const date = text(record, key);
  return date !== null && dateWithinRange(date, context.dataPeriod);
}

function metric(
  context: MetricServiceContext,
  key: string,
  value: Parameters<typeof createMetricViewModel>[0]["value"],
  warnings: readonly string[] = [],
): MetricViewModel {
  return createMetricViewModel({
    metricKey: key,
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: context.sourceStatuses,
    value,
    warnings,
  });
}

export function buildFinanceActualMetrics(
  context: MetricServiceContext,
  records: readonly ManualMetricRecord[],
): {
  readonly total: MetricViewModel;
  readonly composition: MetricBreakdownViewModel;
} {
  const applicable = records.filter((record) => inPeriod(record, "Date", context));
  const amounts = applicable.flatMap((record) => {
    const value = number(record, "Amount USD");
    return value === null ? [] : [usdFromDecimalNumber(value)];
  });
  const grouped = new Map<string, ReturnType<typeof usdFromDecimalNumber>[]>();
  for (const record of applicable) {
    const category = text(record, "Category");
    const amount = number(record, "Amount USD");
    if (category === null || amount === null) continue;
    grouped.set(category, [...(grouped.get(category) ?? []), usdFromDecimalNumber(amount)]);
  }
  const totalValue =
    amounts.length === 0 ? null : { kind: "money" as const, value: addUsd(amounts) };
  const total = metric(context, "finance.actual_expenses", totalValue);
  return {
    total,
    composition: metricBreakdownViewModelSchema.parse({
      metric: metric(context, "finance.expense_composition", totalValue),
      dimension: "expense_category",
      items: [...grouped].map(([key, values]) => ({
        key,
        label: key,
        values: [{ kind: "money", value: addUsd(values) }],
        warnings: [],
      })),
    }),
  };
}

export function buildMarketingSpendMetric(
  context: MetricServiceContext,
  records: readonly ManualMetricRecord[],
): MetricViewModel {
  const amounts = records
    .filter((record) => inPeriod(record, "Date", context))
    .flatMap((record) => {
      const value = number(record, "Spend USD");
      return value === null ? [] : [usdFromDecimalNumber(value)];
    });
  return metric(
    context,
    "marketing.spend",
    amounts.length === 0 ? null : { kind: "money", value: addUsd(amounts) },
    ["SPEND_ONLY_NO_ATTRIBUTION"],
  );
}

export function buildDepletionsBreakdown(
  context: MetricServiceContext,
  records: readonly ManualMetricRecord[],
): MetricBreakdownViewModel {
  const applicable = records.filter((record) => inPeriod(record, "Date", context));
  const grouped = new Map<string, number[]>();
  for (const record of applicable) {
    const reason = text(record, "Reason");
    const quantity = number(record, "Quantity");
    if (reason === null || quantity === null) continue;
    grouped.set(reason, [...(grouped.get(reason) ?? []), quantity]);
  }
  const values = [...grouped.values()].flat();
  const base = metric(
    context,
    "inventory.depletions",
    values.length === 0 ? null : { kind: "quantity", value: sumFiniteNumbers(values) },
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "reason",
    items: [...grouped].map(([key, quantities]) => ({
      key,
      label: key,
      values: [{ kind: "quantity", value: sumFiniteNumbers(quantities) }],
      warnings: [],
    })),
  });
}

export function buildPartnerPerformanceTable(
  context: MetricServiceContext,
  _records: readonly ManualMetricRecord[],
): MetricTableViewModel {
  void _records;
  const base = metric(context, "partners.performance", null, ["PHASE_2_NOT_CONFIGURED"]);
  return metricTableViewModelSchema.parse({
    metric: base,
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
    rows: [],
  });
}

export function buildGrowthPipelineViews(
  context: MetricServiceContext,
  records: readonly ManualMetricRecord[],
): {
  readonly open: MetricViewModel;
  readonly byType: MetricBreakdownViewModel;
  readonly nextActions: MetricTableViewModel;
} {
  const openStages = new Set([
    "prospect",
    "contacted",
    "sampling",
    "negotiating",
    "negotiation",
    "warm lead",
    "in discussion",
    "in_discussion",
    "proposal sent",
    "proposal_sent",
  ]);
  const open = records.filter(
    (record) =>
      text(record, "Status") === "Open" &&
      openStages.has((text(record, "Stage") ?? "").toLowerCase()),
  );
  const ids = new Set(
    open.flatMap((record) => {
      const id = text(record, "Opportunity ID");
      return id ? [id] : [];
    }),
  );
  const openValues = open.flatMap((record) => {
    const value = number(record, "Value USD");
    return value === null ? [] : [usdFromDecimalNumber(value)];
  });
  const openMetric = metric(
    context,
    "growth.open_pipeline",
    ids.size === 0 || openValues.length === 0 ? null : { kind: "money", value: addUsd(openValues) },
    [
      ...(open.length > ids.size ? ["OPPORTUNITY_ID_COVERAGE_PARTIAL"] : []),
      ...(openValues.length < open.length ? ["PIPELINE_VALUE_COVERAGE_PARTIAL"] : []),
    ],
  );
  const grouped = new Map<string, ManualMetricRecord[]>();
  for (const record of open.filter((record) => text(record, "Opportunity ID") !== null)) {
    const type = text(record, "Pipeline Type");
    if (type !== null) grouped.set(type, [...(grouped.get(type) ?? []), record]);
  }
  const byTypeBase = metric(
    context,
    "growth.pipeline_by_type",
    ids.size === 0 ? null : { kind: "count", value: ids.size },
  );
  return {
    open: openMetric,
    byType: metricBreakdownViewModelSchema.parse({
      metric: byTypeBase,
      dimension: "pipeline_type",
      items: [...grouped].map(([key, rows]) => ({
        key,
        label: key,
        values: [
          { kind: "count", value: new Set(rows.map((row) => text(row, "Opportunity ID"))).size },
        ],
        warnings: [],
      })),
    }),
    nextActions: metricTableViewModelSchema.parse({
      metric: metric(
        context,
        "growth.next_actions",
        open.some((record) => text(record, "Due Date") !== null)
          ? {
              kind: "date",
              value:
                open
                  .map((record) => text(record, "Due Date"))
                  .filter((value): value is string => value !== null)
                  .sort()[0] ?? context.dataPeriod.endDate,
            }
          : null,
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
      rows: open
        .sort(
          (left, right) =>
            (text(left, "Due Date") ?? "9999-12-31").localeCompare(
              text(right, "Due Date") ?? "9999-12-31",
            ) ||
            (text(left, "Last Activity Date") ?? "0000-00-00").localeCompare(
              text(right, "Last Activity Date") ?? "0000-00-00",
            ),
        )
        .map((record) => ({
          pipelineType: text(record, "Pipeline Type"),
          opportunityId: text(record, "Opportunity ID"),
          opportunityName: text(record, "Opportunity Name"),
          stage: text(record, "Stage"),
          status: text(record, "Status"),
          nextAction: text(record, "Next Action"),
          dueDate: text(record, "Due Date"),
          valueMinorUnits:
            number(record, "Value USD") === null
              ? null
              : usdFromDecimalNumber(number(record, "Value USD") ?? 0).minorUnits,
        })),
    }),
  };
}

export function buildSocialMetricsTable(
  context: MetricServiceContext,
  records: readonly ManualMetricRecord[],
): MetricTableViewModel {
  const applicable = records.filter((record) => inPeriod(record, "Date", context));
  const supportedPlatforms = new Set(["instagram", "tiktok", "linkedin"]);
  const latestByAccount = new Map<string, ManualMetricRecord>();
  const historyByAccount = new Map<string, ManualMetricRecord[]>();
  for (const record of applicable.filter((row) =>
    supportedPlatforms.has((text(row, "Platform") ?? "").toLowerCase()),
  )) {
    const key = `${text(record, "Platform") ?? ""}:${text(record, "Account") ?? ""}`;
    historyByAccount.set(key, [...(historyByAccount.get(key) ?? []), record]);
    const prior = latestByAccount.get(key);
    if (!prior || (text(record, "Date") ?? "") > (text(prior, "Date") ?? "")) {
      latestByAccount.set(key, record);
    }
  }
  const base = metric(
    context,
    "social.performance",
    latestByAccount.size === 0
      ? null
      : {
          kind: "count",
          value: sumFiniteNumbers(
            [...latestByAccount.values()].map((row) => number(row, "Followers") ?? 0),
          ),
        },
    ["SOCIAL_AUDIENCE_GROWTH_V1"],
  );
  return metricTableViewModelSchema.parse({
    metric: base,
    columns: [
      "date",
      "platform",
      "account",
      "followers",
      "previousFollowers",
      "netNewFollowers",
      "growthPercent",
      "impressions",
      "reach",
      "engagements",
      "linkClicks",
    ],
    rows: [...latestByAccount].map(([key, record]) => {
      const history = [...(historyByAccount.get(key) ?? [])].sort((left, right) =>
        (text(left, "Date") ?? "").localeCompare(text(right, "Date") ?? ""),
      );
      const previous = history.at(-2);
      const followers = number(record, "Followers");
      const previousFollowers = previous ? number(previous, "Followers") : null;
      const netNewFollowers =
        followers !== null && previousFollowers !== null ? followers - previousFollowers : null;
      return {
        date: text(record, "Date"),
        platform: text(record, "Platform"),
        account: text(record, "Account"),
        followers,
        previousFollowers,
        netNewFollowers,
        growthPercent:
          netNewFollowers !== null && previousFollowers !== null && previousFollowers !== 0
            ? (netNewFollowers / previousFollowers) * 100
            : null,
        impressions: null,
        reach: null,
        engagements: null,
        linkClicks: null,
      };
    }),
  });
}

export function buildManualWorkbookMetrics(
  context: MetricServiceContext,
  workbook: ManualWorkbookFacts,
) {
  const finance = buildFinanceActualMetrics(context, workbook.tabs.Finance_Actuals.records);
  const pipeline = buildGrowthPipelineViews(context, workbook.tabs.Growth_Pipeline.records);
  return {
    metrics: [
      finance.total,
      buildMarketingSpendMetric(context, workbook.tabs.Marketing_Spend.records),
      pipeline.open,
    ],
    breakdowns: [
      finance.composition,
      buildDepletionsBreakdown(context, workbook.tabs.Depletions.records),
      pipeline.byType,
    ],
    tables: [
      buildPartnerPerformanceTable(context, workbook.tabs.Partner_Performance.records),
      pipeline.nextActions,
      buildSocialMetricsTable(context, workbook.tabs.Social_Metrics.records),
    ],
  } as const;
}

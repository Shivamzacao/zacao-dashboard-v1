import {
  buildKlaviyoEmailOverview,
  buildKlaviyoDemographicBreakdowns,
  buildKlaviyoEngagementSeries,
  buildKlaviyoNoActivityMetric,
  buildKlaviyoPerformanceTable,
  buildKlaviyoSmsOverview,
} from "@/src/application/metrics";
import type { MetricServiceContext } from "@/src/application/metrics/types";
import type {
  DashboardContribution,
  DashboardDatasetContributor,
  OrchestrationContext,
} from "@/src/application/orchestration";
import type { CachePolicy, SourceStatus } from "@/src/domain/contracts";

import type { KlaviyoAdapter } from "./adapter";
import type { KlaviyoDemographicProperties } from "./config";
import {
  mapKlaviyoEmailOverviewFact,
  mapKlaviyoPerformanceRows,
  mapKlaviyoSmsFact,
  mapKlaviyoTrendPoints,
} from "./facts";
import { VERIFIED_KLAVIYO_METRICS } from "./metric-registry";
import type { normalizeKlaviyoReportRows } from "./normalization";
import { klaviyoSourceStatus } from "./source-status";

const KLAVIYO_CACHE: CachePolicy = { freshForSeconds: 900, staleForSeconds: 3_600 };

function metricContext(
  context: OrchestrationContext,
  sourceStatuses: readonly SourceStatus[],
): MetricServiceContext {
  return {
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sourceStatuses,
  };
}

class KlaviyoContributor implements DashboardDatasetContributor {
  readonly source = "klaviyo" as const;
  readonly cachePolicy = KLAVIYO_CACHE;

  constructor(
    readonly dataset: string,
    readonly sourceIdentity: string,
    private readonly loadContribution: (
      context: OrchestrationContext,
    ) => Promise<DashboardContribution>,
  ) {}

  load(context: OrchestrationContext): Promise<DashboardContribution> {
    return this.loadContribution(context);
  }
}

function verifiedMetricId(key: string): string {
  const metric = VERIFIED_KLAVIYO_METRICS.find((entry) => entry.key === key);
  if (!metric) throw new Error(`Verified Klaviyo metric is missing: ${key}`);
  return metric.id;
}

/**
 * Future-Ready Klaviyo contributors: an empty account is a successful
 * no-activity state, never an error, and populated report data flows through
 * the same contracts without redesign.
 */
export function createKlaviyoContributors(input: {
  adapter: KlaviyoAdapter;
  sourceIdentity: string;
  now: () => Date;
  demographicProperties?: KlaviyoDemographicProperties | null;
}): readonly DashboardDatasetContributor[] {
  const { adapter, sourceIdentity, now, demographicProperties = null } = input;

  const performance = new KlaviyoContributor(
    "klaviyo-performance",
    sourceIdentity,
    async (context) => {
      // An account with zero events cannot produce values reports — Klaviyo
      // rejects the conversion metric outright. That is the Future-Ready
      // "no activity yet" state, not a failure, so skip the report calls
      // until genuine events exist and reports become queryable.
      const hasEvents = await adapter.readEventPresence();
      const emptyReportRows: ReturnType<typeof normalizeKlaviyoReportRows> = [];
      const [emailCampaigns, smsCampaigns, flows, campaignReport, flowReport] = await Promise.all([
        adapter.readCampaigns("email"),
        adapter.readCampaigns("sms"),
        adapter.readFlows(),
        hasEvents
          ? adapter.readCampaignReport(context.dataPeriod)
          : Promise.resolve({ rows: emptyReportRows }),
        hasEvents
          ? adapter.readFlowReport(context.dataPeriod)
          : Promise.resolve({ rows: emptyReportRows }),
      ]);
      const reportRowCount = campaignReport.rows.length + flowReport.rows.length;
      const status = klaviyoSourceStatus({
        checkedAt: now().toISOString(),
        recordCount: reportRowCount,
      });
      const serviceContext = metricContext(context, [status]);

      const campaignNames = new Map(
        [...emailCampaigns.records, ...smsCampaigns.records].map(({ id, name }) => [id, name]),
      );
      const flowNames = new Map(flows.records.map(({ id, name }) => [id, name]));
      const campaignRows = mapKlaviyoPerformanceRows({
        rows: campaignReport.rows,
        groupingIdKey: "campaign_id",
        namesById: campaignNames,
      });
      const flowRows = mapKlaviyoPerformanceRows({
        rows: flowReport.rows,
        groupingIdKey: "flow_id",
        namesById: flowNames,
      });
      const allRows = [...campaignReport.rows, ...flowReport.rows];

      return {
        metrics: [
          ...buildKlaviyoEmailOverview(serviceContext, mapKlaviyoEmailOverviewFact(allRows)),
          ...buildKlaviyoSmsOverview(serviceContext, mapKlaviyoSmsFact(allRows)),
        ],
        tables: [
          buildKlaviyoPerformanceTable(serviceContext, "campaign", campaignRows),
          buildKlaviyoPerformanceTable(serviceContext, "flow", flowRows),
        ],
        sourceStatuses: [status],
      };
    },
  );

  const engagement = new KlaviyoContributor(
    "klaviyo-engagement",
    sourceIdentity,
    async (context) => {
      const [opened, clicked] = await Promise.all([
        adapter.readMetricAggregate({
          metricId: verifiedMetricId("opened_email"),
          dateRange: context.dataPeriod,
          interval: "month",
        }),
        adapter.readMetricAggregate({
          metricId: verifiedMetricId("clicked_email"),
          dateRange: context.dataPeriod,
          interval: "month",
        }),
      ]);
      const hasActivity = opened.activityState === "current" || clicked.activityState === "current";
      const status = klaviyoSourceStatus({
        checkedAt: now().toISOString(),
        recordCount: hasActivity ? 1 : 0,
      });
      const serviceContext = metricContext(context, [status]);
      const points = hasActivity
        ? mapKlaviyoTrendPoints([...opened.series, ...clicked.series])
        : [];
      return {
        series: [buildKlaviyoEngagementSeries(serviceContext, "month", points)],
        sourceStatuses: [status],
      };
    },
  );

  const demographics = new KlaviyoContributor(
    "klaviyo-profiles",
    demographicProperties
      ? `${sourceIdentity}.profiles.configured`
      : `${sourceIdentity}.profiles.not-configured`,
    async (context) => {
      const checkedAt = now().toISOString();
      if (!demographicProperties) {
        const status: SourceStatus = {
          source: "klaviyo",
          state: "not_configured",
          checkedAt,
          lastSuccessfulAt: null,
          dataAsOf: null,
          completeness: "unknown",
          warningCodes: ["KLAVIYO_PROFILE_PROPERTIES_NOT_CONFIGURED"],
        };
        return {
          breakdowns: buildKlaviyoDemographicBreakdowns(metricContext(context, [status]), null),
          sourceStatuses: [status],
        };
      }
      const fact = await adapter.readProfileDemographics(demographicProperties);
      const baseStatus = klaviyoSourceStatus({ checkedAt, recordCount: fact.totalProfiles });
      const status: SourceStatus = fact.truncated
        ? {
            ...baseStatus,
            state: "partial",
            completeness: "partial",
            warningCodes: [...baseStatus.warningCodes, "KLAVIYO_PROFILES_TRUNCATED"],
          }
        : baseStatus;
      return {
        breakdowns: buildKlaviyoDemographicBreakdowns(metricContext(context, [status]), fact),
        sourceStatuses: [status],
      };
    },
  );

  const readiness = new KlaviyoContributor("klaviyo-readiness", sourceIdentity, async (context) => {
    const hasEvents = await adapter.readEventPresence();
    const status = klaviyoSourceStatus({
      checkedAt: now().toISOString(),
      recordCount: hasEvents ? 1 : 0,
    });
    return {
      metrics: [buildKlaviyoNoActivityMetric(metricContext(context, [status]), hasEvents)],
      sourceStatuses: [status],
    };
  });

  return [performance, engagement, demographics, readiness];
}

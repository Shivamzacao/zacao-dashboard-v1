import { composeDashboardPage } from "@/src/application/metrics";
import type { ClockPort } from "@/src/application/ports";
import type {
  MetricBreakdownViewModel,
  MetricSeriesViewModel,
  MetricTableViewModel,
  MetricViewModel,
} from "@/src/application/view-models";
import {
  dashboardFiltersSchema,
  sourceStatusSchema,
  type SourceStatus,
} from "@/src/domain/contracts";
import { createDatasetCacheKey } from "@/src/domain/utilities/cache-key";
import { normalizeDashboardFilters } from "@/src/domain/utilities/filters";

import type { CacheCoordinator } from "./cache-coordinator";
import {
  REPORTING_CURRENCY,
  REPORTING_TIME_ZONE,
  type DashboardContribution,
  type DashboardDatasetContributor,
  type DashboardRequest,
  type DashboardSectionPlan,
  type DatasetCacheMetadata,
  type OrchestratedDashboardResult,
  type OrchestrationContext,
} from "./types";

const unusableStates: readonly SourceStatus["state"][] = [
  "error",
  "unavailable",
  "invalid",
  "not_configured",
];

function isCacheable(contribution: DashboardContribution): boolean {
  return contribution.sourceStatuses.every((status) => !unusableStates.includes(status.state));
}

function staleStatus(status: SourceStatus, checkedAt: string): SourceStatus {
  return sourceStatusSchema.parse({
    ...status,
    state: "stale",
    checkedAt,
    warningCodes: [...new Set([...status.warningCodes, "CACHE_STALE_FALLBACK"])],
  });
}

function staleMetric(metric: MetricViewModel, checkedAt: string): MetricViewModel {
  const warnings = [...new Set([...metric.warnings, "CACHE_STALE_FALLBACK"])];
  return {
    ...metric,
    readiness: {
      state: "stale",
      message: "A disclosed last-known-good cached result is being used.",
      warningCodes: [...new Set([...metric.readiness.warningCodes, "CACHE_STALE_FALLBACK"])],
    },
    sources: metric.sources.map((status) => staleStatus(status, checkedAt)),
    warnings,
  };
}

function staleContribution(
  contribution: DashboardContribution,
  checkedAt: string,
): DashboardContribution {
  const metric = (value: MetricViewModel): MetricViewModel => staleMetric(value, checkedAt);
  return {
    ...(contribution.metrics ? { metrics: contribution.metrics.map(metric) } : {}),
    ...(contribution.series
      ? {
          series: contribution.series.map((value): MetricSeriesViewModel => ({
            ...value,
            metric: metric(value.metric),
          })),
        }
      : {}),
    ...(contribution.breakdowns
      ? {
          breakdowns: contribution.breakdowns.map((value): MetricBreakdownViewModel => ({
            ...value,
            metric: metric(value.metric),
          })),
        }
      : {}),
    ...(contribution.tables
      ? {
          tables: contribution.tables.map((value): MetricTableViewModel => ({
            ...value,
            metric: metric(value.metric),
          })),
        }
      : {}),
    sourceStatuses: contribution.sourceStatuses.map((status) => staleStatus(status, checkedAt)),
    warnings: [...new Set([...(contribution.warnings ?? []), "CACHE_STALE_FALLBACK"])],
  };
}

function unavailableContribution(
  contributor: DashboardDatasetContributor,
  checkedAt: string,
): DashboardContribution {
  return {
    sourceStatuses: [
      sourceStatusSchema.parse({
        source: contributor.source,
        state: "unavailable",
        checkedAt,
        lastSuccessfulAt: null,
        dataAsOf: null,
        completeness: "unknown",
        warningCodes: ["DATASET_UNAVAILABLE", `DATASET:${contributor.dataset}`],
      }),
    ],
    warnings: [`DATASET_UNAVAILABLE:${contributor.dataset}`],
  };
}

function mergeSourceStatuses(statuses: readonly SourceStatus[]): readonly SourceStatus[] {
  const bySource = new Map<SourceStatus["source"], SourceStatus[]>();
  for (const status of statuses) {
    bySource.set(status.source, [...(bySource.get(status.source) ?? []), status]);
  }
  return [...bySource.entries()].map(([source, values]) => {
    if (values.length === 1) return values[0] as SourceStatus;
    const usable = values.filter((status) => !unusableStates.includes(status.state));
    if (usable.length > 0 && usable.length < values.length) {
      const latest = [...usable].sort((left, right) =>
        right.checkedAt.localeCompare(left.checkedAt),
      )[0] as SourceStatus;
      return sourceStatusSchema.parse({
        ...latest,
        source,
        state: "partial",
        completeness: "partial",
        warningCodes: [
          ...new Set(
            values.flatMap((status) => status.warningCodes).concat("PARTIAL_DATASET_FAILURE"),
          ),
        ],
      });
    }
    const priority: readonly SourceStatus["state"][] = [
      "error",
      "unavailable",
      "invalid",
      "not_configured",
      "stale",
      "partial",
      "no_activity",
      "current",
    ];
    return priority.flatMap((state) =>
      values.filter((status) => status.state === state),
    )[0] as SourceStatus;
  });
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (next < values.length) {
        const index = next++;
        results[index] = await operation(values[index] as T);
      }
    }),
  );
  return results;
}

export class DashboardOrchestrator {
  private readonly contributors: ReadonlyMap<string, DashboardDatasetContributor>;

  constructor(
    contributors: readonly DashboardDatasetContributor[],
    private readonly sectionPlan: DashboardSectionPlan,
    private readonly cache: CacheCoordinator,
    private readonly clock: ClockPort,
    private readonly maxConcurrency = 4,
  ) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 16) {
      throw new TypeError("Orchestration concurrency must be an integer from 1 to 16");
    }
    const mapped = new Map(contributors.map((contributor) => [contributor.dataset, contributor]));
    if (mapped.size !== contributors.length)
      throw new TypeError("Dataset contributors must be unique");
    this.contributors = mapped;
  }

  async loadPage(request: DashboardRequest): Promise<OrchestratedDashboardResult> {
    const filters = normalizeDashboardFilters(dashboardFiltersSchema.parse(request.filters));
    const datasetKeys = [...new Set(this.sectionPlan[request.section] ?? [])];
    const contributors = datasetKeys.map((dataset) => {
      const contributor = this.contributors.get(dataset);
      if (!contributor) throw new TypeError(`Missing contributor for planned dataset: ${dataset}`);
      return contributor;
    });
    const baseContext: OrchestrationContext = {
      environment: request.environment,
      dataPeriod: { startDate: filters.startDate, endDate: filters.endDate },
      filters,
      reportingTimeZone: REPORTING_TIME_ZONE,
      currency: REPORTING_CURRENCY,
      sourceStatuses: [],
    };

    const loaded = await mapWithConcurrency(
      contributors,
      this.maxConcurrency,
      async (contributor) => {
        const key = createDatasetCacheKey({
          environment: request.environment,
          source: contributor.source,
          sourceIdentity: contributor.sourceIdentity,
          dataset: contributor.dataset,
          filters,
        });
        try {
          const result = await this.cache.load({
            key,
            tags: [
              "schema:1.0",
              `environment:${request.environment}`,
              `source:${contributor.source}`,
              `dataset:${contributor.dataset}`,
            ],
            policy: contributor.cachePolicy,
            bypass: request.cacheMode === "bypass",
            load: async () => {
              const contribution = await contributor.load(baseContext);
              return { value: contribution, cacheable: isCacheable(contribution) };
            },
          });
          return {
            contribution:
              result.cache.state === "stale"
                ? staleContribution(result.value, this.clock.now().toISOString())
                : result.value,
            cache: {
              dataset: contributor.dataset,
              source: contributor.source,
              cache: result.cache,
            } satisfies DatasetCacheMetadata,
          };
        } catch {
          return {
            contribution: unavailableContribution(contributor, this.clock.now().toISOString()),
            cache: {
              dataset: contributor.dataset,
              source: contributor.source,
              cache: {
                state: request.cacheMode === "bypass" ? "bypass" : "miss",
                generatedAt: this.clock.now().toISOString(),
                expiresAt: null,
              },
            } satisfies DatasetCacheMetadata,
          };
        }
      },
    );

    const contributions = loaded.map(({ contribution }) => contribution);
    const sourceStatuses = mergeSourceStatuses(
      contributions.flatMap(({ sourceStatuses: statuses }) => statuses),
    );
    const context = { ...baseContext, sourceStatuses };
    return {
      page: composeDashboardPage({
        section: request.section,
        context,
        metrics: contributions.flatMap(({ metrics }) => metrics ?? []),
        series: contributions.flatMap(({ series }) => series ?? []),
        breakdowns: contributions.flatMap(({ breakdowns }) => breakdowns ?? []),
        tables: contributions.flatMap(({ tables }) => tables ?? []),
        warnings: [...new Set(contributions.flatMap(({ warnings }) => warnings ?? []))],
      }),
      cache: loaded.map(({ cache }) => cache),
    };
  }
}

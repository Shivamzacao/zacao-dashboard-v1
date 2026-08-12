import { composeDashboardPage } from "@/src/application/metrics";
import type { ClockPort, LoggerPort } from "@/src/application/ports";
import type {
  DashboardPageViewModel,
  MetricBreakdownViewModel,
  MetricSeriesViewModel,
  MetricTableViewModel,
  MetricViewModel,
} from "@/src/application/view-models";
import {
  dashboardFiltersSchema,
  sourceStatusSchema,
  type DashboardFilters,
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

/**
 * Classifies a dataset failure into a short, non-sensitive code. Adapter
 * errors expose a `kind` discriminator (for example Shopify's `timeout` or
 * `throttled`); anything else falls back to the error's constructor name.
 * Only the classification is disclosed — raw messages can carry request
 * detail and never enter an API response.
 */
function failureKind(error: unknown): string {
  const candidate =
    typeof error === "object" && error !== null && "kind" in error
      ? (error as { readonly kind: unknown }).kind
      : error instanceof Error
        ? error.name
        : null;
  const kind = typeof candidate === "string" ? candidate.trim() : "";
  return kind === "" ? "unknown" : kind.slice(0, 40);
}

function unavailableContribution(
  contributor: DashboardDatasetContributor,
  checkedAt: string,
  kind: string,
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
        warningCodes: [
          "DATASET_UNAVAILABLE",
          `DATASET:${contributor.dataset}`,
          `DATASET_FAILURE_KIND:${kind}`,
        ],
      }),
    ],
    warnings: [`DATASET_UNAVAILABLE:${contributor.dataset}:${kind}`],
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
    private readonly logger: LoggerPort | null = null,
  ) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 16) {
      throw new TypeError("Orchestration concurrency must be an integer from 1 to 16");
    }
    const mapped = new Map(contributors.map((contributor) => [contributor.dataset, contributor]));
    if (mapped.size !== contributors.length)
      throw new TypeError("Dataset contributors must be unique");
    this.contributors = mapped;
  }

  private async fetchContributions(
    request: DashboardRequest,
    filters: DashboardFilters,
    contributors: readonly DashboardDatasetContributor[],
  ): Promise<{
    readonly contributions: readonly DashboardContribution[];
    readonly cache: readonly DatasetCacheMetadata[];
  }> {
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
        } catch (error) {
          // A failed dataset renders as an empty panel, so it must never be
          // silent: without this the page is indistinguishable from one that
          // genuinely has no data.
          const kind = failureKind(error);
          this.logger?.error("dashboard.dataset_failed", {
            dataset: contributor.dataset,
            source: contributor.source,
            section: request.section,
            kind,
            message: error instanceof Error ? error.message : String(error),
          });
          return {
            contribution: unavailableContribution(
              contributor,
              this.clock.now().toISOString(),
              kind,
            ),
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

    return {
      contributions: loaded.map(({ contribution }) => contribution),
      cache: loaded.map(({ cache }) => cache),
    };
  }

  private composePage(
    request: DashboardRequest,
    filters: DashboardFilters,
    contributions: readonly DashboardContribution[],
  ): DashboardPageViewModel {
    const sourceStatuses = mergeSourceStatuses(
      contributions.flatMap(({ sourceStatuses: statuses }) => statuses),
    );
    const context: OrchestrationContext = {
      environment: request.environment,
      dataPeriod: { startDate: filters.startDate, endDate: filters.endDate },
      filters,
      reportingTimeZone: REPORTING_TIME_ZONE,
      currency: REPORTING_CURRENCY,
      sourceStatuses,
    };
    return composeDashboardPage({
      section: request.section,
      context,
      metrics: contributions.flatMap(({ metrics }) => metrics ?? []),
      series: contributions.flatMap(({ series }) => series ?? []),
      breakdowns: contributions.flatMap(({ breakdowns }) => breakdowns ?? []),
      tables: contributions.flatMap(({ tables }) => tables ?? []),
      warnings: [...new Set(contributions.flatMap(({ warnings }) => warnings ?? []))],
    });
  }

  async loadPage(request: DashboardRequest): Promise<OrchestratedDashboardResult> {
    const filters = normalizeDashboardFilters(dashboardFiltersSchema.parse(request.filters));
    const datasetKeys = [...new Set(this.sectionPlan[request.section] ?? [])];
    const contributors = datasetKeys.map((dataset) => {
      const contributor = this.contributors.get(dataset);
      if (!contributor) throw new TypeError(`Missing contributor for planned dataset: ${dataset}`);
      return contributor;
    });

    const primary = await this.fetchContributions(request, filters, contributors);
    const page = this.composePage(request, filters, primary.contributions);
    return { page, cache: primary.cache };
  }
}

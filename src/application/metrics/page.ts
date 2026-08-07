import {
  dashboardPageViewModelSchema,
  type DashboardPageViewModel,
  type MetricBreakdownViewModel,
  type MetricSeriesViewModel,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import { metricCatalog, type DashboardSection } from "@/src/domain/metrics/catalog";

import type { MetricServiceContext } from "./types";
import { createMetricViewModel } from "./view-model";

export function composeDashboardPage(input: {
  readonly section: DashboardSection;
  readonly context: MetricServiceContext;
  readonly metrics?: readonly MetricViewModel[];
  readonly series?: readonly MetricSeriesViewModel[];
  readonly breakdowns?: readonly MetricBreakdownViewModel[];
  readonly tables?: readonly MetricTableViewModel[];
  readonly warnings?: readonly string[];
}): DashboardPageViewModel {
  const supplied = new Map((input.metrics ?? []).map((metric) => [metric.key, metric]));
  for (const item of input.series ?? []) supplied.set(item.metric.key, item.metric);
  for (const item of input.breakdowns ?? []) supplied.set(item.metric.key, item.metric);
  for (const item of input.tables ?? []) supplied.set(item.metric.key, item.metric);

  const sectionMetrics = metricCatalog
    .filter(({ sections }) => sections.includes(input.section))
    .map(
      (definition) =>
        supplied.get(definition.key) ??
        createMetricViewModel({
          metricKey: definition.key,
          environment: input.context.environment,
          dataPeriod: input.context.dataPeriod,
          sources: input.context.sourceStatuses.filter((source) =>
            definition.sourceKeys.includes(source.source),
          ),
          value: null,
        }),
    );

  return dashboardPageViewModelSchema.parse({
    section: input.section,
    dataPeriod: input.context.dataPeriod,
    metrics: sectionMetrics,
    series: input.series ?? [],
    breakdowns: input.breakdowns ?? [],
    tables: input.tables ?? [],
    sources: input.context.sourceStatuses,
    warnings: input.warnings ?? [],
  });
}

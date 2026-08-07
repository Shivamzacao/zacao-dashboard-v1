import {
  metricBreakdownViewModelSchema,
  metricTableViewModelSchema,
  type MetricBreakdownViewModel,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import { sumFiniteNumbers } from "@/src/domain/metrics/calculations";
import { addUsd, usd } from "@/src/domain/utilities/money";

import type {
  CashPositionFact,
  CombinedInventoryFact,
  ForecastVarianceFact,
  InventoryLotFact,
  MetricServiceContext,
  PlanActualFact,
  ProductionIncomingFact,
} from "./types";
import { createMetricViewModel } from "./view-model";

function metric(
  context: MetricServiceContext,
  metricKey: string,
  value: Parameters<typeof createMetricViewModel>[0]["value"],
  input: { readonly warnings?: readonly string[]; readonly dataPendingReason?: string } = {},
): MetricViewModel {
  return createMetricViewModel({
    metricKey,
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: context.sourceStatuses,
    value,
    warnings: input.warnings ?? [],
    ...(input.dataPendingReason ? { dataPendingReason: input.dataPendingReason } : {}),
  });
}

export function buildCombinedInventoryBreakdown(
  context: MetricServiceContext,
  facts: readonly CombinedInventoryFact[],
  completeRequiredLocations: boolean,
): MetricBreakdownViewModel {
  const grouped = new Map<string, number[]>();
  for (const fact of facts) {
    const key = `${fact.warehouse}:${fact.sku}`;
    grouped.set(key, [...(grouped.get(key) ?? []), fact.quantity]);
  }
  const value =
    facts.length === 0 || !completeRequiredLocations
      ? null
      : {
          kind: "quantity" as const,
          value: sumFiniteNumbers(facts.map(({ quantity }) => quantity)),
        };
  const base = metric(context, "inventory.combined", value, {
    warnings: completeRequiredLocations ? [] : ["INVENTORY_LOCATION_COVERAGE_INCOMPLETE"],
    dataPendingReason: "Complete mapped warehouse coverage is required.",
  });
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "warehouse_sku",
    items: completeRequiredLocations
      ? [...grouped].map(([key, quantities]) => ({
          key,
          label: key,
          values: [{ kind: "quantity", value: sumFiniteNumbers(quantities) }],
          warnings: [],
        }))
      : [],
  });
}

export function buildInventoryLotsTable(
  context: MetricServiceContext,
  facts: readonly InventoryLotFact[],
): MetricTableViewModel {
  const base = metric(
    context,
    "inventory.lots",
    facts.length === 0
      ? null
      : {
          kind: "quantity",
          value: sumFiniteNumbers(facts.map(({ quantityRemaining }) => quantityRemaining)),
        },
  );
  return metricTableViewModelSchema.parse({
    metric: base,
    columns: [
      "asOfDate",
      "warehouse",
      "sku",
      "lotCode",
      "bestByDate",
      "quantityRemaining",
      "status",
    ],
    rows: facts.map((fact) => ({ ...fact })),
  });
}

export function buildForecastVarianceTable(
  context: MetricServiceContext,
  facts: readonly ForecastVarianceFact[],
): MetricTableViewModel {
  const totalVariance = sumFiniteNumbers(
    facts.map(({ actualUnits, forecastUnits }) => actualUnits - forecastUnits),
  );
  const base = metric(
    context,
    "forecast.variance",
    facts.length === 0 ? null : { kind: "quantity", value: totalVariance },
    { warnings: ["UNIT_VARIANCE_ONLY"] },
  );
  return metricTableViewModelSchema.parse({
    metric: base,
    columns: ["period", "sku", "channel", "forecastUnits", "actualUnits", "varianceUnits"],
    rows: facts.map((fact) => ({ ...fact, varianceUnits: fact.actualUnits - fact.forecastUnits })),
  });
}

export function buildIncomingProductionTable(
  context: MetricServiceContext,
  facts: readonly ProductionIncomingFact[],
): MetricTableViewModel {
  const base = metric(
    context,
    "production.incoming",
    facts.length === 0
      ? null
      : {
          kind: "quantity",
          value: sumFiniteNumbers(facts.map(({ incomingUnits }) => incomingUnits)),
        },
  );
  return metricTableViewModelSchema.parse({
    metric: base,
    columns: [
      "poNumber",
      "poLine",
      "sku",
      "destinationWarehouse",
      "status",
      "expectedArrivalDate",
      "incomingUnits",
      "unitsReceived",
    ],
    rows: facts.map((fact) => ({ ...fact })),
  });
}

export function buildCashPositionMetric(
  context: MetricServiceContext,
  facts: readonly CashPositionFact[],
  completeAccountCoverage: boolean,
): MetricViewModel {
  const latestDate = facts
    .map(({ date }) => date)
    .sort()
    .at(-1);
  const latest = latestDate ? facts.filter(({ date }) => date === latestDate) : [];
  return metric(
    context,
    "finance.cash_position",
    latest.length === 0 || !completeAccountCoverage
      ? null
      : {
          kind: "money",
          value: addUsd(latest.map(({ balanceMinorUnits }) => usd(balanceMinorUnits))),
        },
    {
      warnings: completeAccountCoverage ? [] : ["CASH_ACCOUNT_COVERAGE_INCOMPLETE"],
      dataPendingReason: "Complete required-account coverage is not established.",
    },
  );
}

export function buildBudgetActualBreakdown(
  context: MetricServiceContext,
  facts: readonly PlanActualFact[],
): MetricBreakdownViewModel {
  const totalVariance = facts.reduce(
    (sum, { actualMinorUnits, planMinorUnits }) => sum + actualMinorUnits - planMinorUnits,
    0,
  );
  const base = metric(
    context,
    "finance.budget_vs_actual",
    facts.length === 0 ? null : { kind: "money", value: usd(totalVariance) },
    { warnings: ["PLAN_AND_ACTUAL_LABELS_REQUIRED"] },
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "mapped_scope",
    items: facts.map(({ scopeKey, planMinorUnits, actualMinorUnits }) => ({
      key: scopeKey,
      label: scopeKey,
      values: [
        { kind: "money", value: usd(planMinorUnits) },
        { kind: "money", value: usd(actualMinorUnits) },
        { kind: "money", value: usd(actualMinorUnits - planMinorUnits) },
      ],
      warnings: ["PLAN", "ACTUAL", "VARIANCE"],
    })),
  });
}

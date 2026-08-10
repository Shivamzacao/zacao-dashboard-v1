import {
  metricBreakdownViewModelSchema,
  metricTableViewModelSchema,
  type MetricBreakdownViewModel,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import {
  approvedThresholdResult,
  groupSum,
  sumFiniteNumbers,
  usdFromDecimalNumber,
} from "@/src/domain/metrics/calculations";
import { addUsd, usd } from "@/src/domain/utilities/money";

import type {
  CashPositionFact,
  CombinedInventoryFact,
  FinanceActualFact,
  ForecastVarianceFact,
  InventoryLotFact,
  MetricServiceContext,
  MetricTargetFact,
  PlanActualFact,
  ProductionIncomingFact,
  SkuCostFact,
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

function addDaysToIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days))
    .toISOString()
    .slice(0, 10);
}

/**
 * The cost effective for a SKU on a given date: the row with the latest
 * `effectiveFrom` at or before that date whose `effectiveTo` has not passed
 * (DEC-018 #2/#6 — COGS_By_SKU is the cost authority, not Shopify).
 */
function effectiveSkuCostUsd(
  costs: readonly SkuCostFact[],
  sku: string,
  asOfDate: string,
): number | null {
  const candidates = costs.filter(
    (cost) =>
      cost.sku === sku &&
      cost.effectiveFrom <= asOfDate &&
      (cost.effectiveTo === null || cost.effectiveTo >= asOfDate),
  );
  const latest = [...candidates].sort((left, right) =>
    left.effectiveFrom < right.effectiveFrom ? 1 : -1,
  )[0];
  return latest?.totalUnitCostUsd ?? null;
}

/** DEC-018 #2: quantity on hand times the effective approved cost, per SKU. */
export function buildInventoryValueMetric(
  context: MetricServiceContext,
  inventory: readonly CombinedInventoryFact[],
  costs: readonly SkuCostFact[],
  asOfDate: string,
): MetricViewModel {
  if (inventory.length === 0) return metric(context, "inventory.value", null);
  const bySku = groupSum(
    inventory,
    ({ sku }) => sku,
    ({ quantity }) => quantity,
  );
  let totalMinorUnits = 0;
  let skusMissingCost = 0;
  let skusWithCost = 0;
  for (const [sku, quantity] of bySku) {
    const costUsd = effectiveSkuCostUsd(costs, sku, asOfDate);
    if (costUsd === null) {
      skusMissingCost += 1;
      continue;
    }
    skusWithCost += 1;
    totalMinorUnits += usdFromDecimalNumber(costUsd).minorUnits * quantity;
  }
  // A total of every SKU missing its cost is not a genuine $0 of inventory —
  // it is "no cost data yet," which must stay unavailable rather than shown
  // as a real, misleadingly precise zero.
  if (skusWithCost === 0) {
    return metric(context, "inventory.value", null, { warnings: ["MISSING_SKU_COST"] });
  }
  return metric(
    context,
    "inventory.value",
    { kind: "money", value: usd(totalMinorUnits) },
    { warnings: skusMissingCost > 0 ? ["MISSING_SKU_COST"] : [] },
  );
}

/** DEC-018 #5: in-stock lots within 90 days of best-by, soonest first. */
export function buildFefoVisibilityMetric(
  context: MetricServiceContext,
  lots: readonly InventoryLotFact[],
  asOfDate: string,
): MetricViewModel {
  if (lots.length === 0) return metric(context, "inventory.fefo", null);
  const horizon = addDaysToIsoDate(asOfDate, 90);
  const atRisk = lots.filter((lot) => lot.status === "in_stock" && lot.bestByDate <= horizon);
  return metric(context, "inventory.fefo", {
    kind: "status",
    value:
      atRisk.length === 0
        ? "No lots expiring within 90 days"
        : `${atRisk.length} lot${atRisk.length === 1 ? "" : "s"} expiring within 90 days`,
  });
}

export interface MonthlyBurnResult {
  readonly metric: MetricViewModel;
  /** Feeds Cash Runway; null when there is no trailing burn to divide by. */
  readonly trailing3MonthAverageMinorUnits: number | null;
}

/** DEC-018 #7: cash-basis expense categories only, most recent month shown. */
export function buildMonthlyBurnMetrics(
  context: MetricServiceContext,
  facts: readonly FinanceActualFact[],
): MonthlyBurnResult {
  const cashExpenses = facts.filter((fact) => fact.cashOrAccrual === "cash");
  const byMonth = groupSum(
    cashExpenses,
    (fact) => fact.period,
    (fact) => Math.abs(fact.amountMinorUnits),
  );
  const months = [...byMonth.keys()].sort();
  const latestMonth = months.at(-1);
  const latestBurnMinorUnits = latestMonth ? (byMonth.get(latestMonth) ?? null) : null;
  const trailing = months.slice(-3);
  const trailing3MonthAverageMinorUnits =
    trailing.length === 0
      ? null
      : Math.round(
          trailing.reduce((sum, month) => sum + (byMonth.get(month) ?? 0), 0) / trailing.length,
        );
  return {
    metric: metric(
      context,
      "finance.monthly_burn",
      latestBurnMinorUnits === null ? null : { kind: "money", value: usd(latestBurnMinorUnits) },
      { warnings: facts.length > 0 && cashExpenses.length === 0 ? ["NO_CASH_EXPENSES"] : [] },
    ),
    trailing3MonthAverageMinorUnits,
  };
}

/** DEC-018 #8: cash on hand divided by the trailing 3-month average burn. */
export function buildCashRunwayMetric(
  context: MetricServiceContext,
  cashFacts: readonly CashPositionFact[],
  completeAccountCoverage: boolean,
  trailing3MonthAverageBurnMinorUnits: number | null,
): MetricViewModel {
  const latestDate = cashFacts
    .map(({ date }) => date)
    .sort()
    .at(-1);
  const latest = latestDate ? cashFacts.filter((fact) => fact.date === latestDate) : [];
  if (latest.length === 0 || !completeAccountCoverage) {
    return metric(context, "finance.cash_runway", null, {
      warnings: completeAccountCoverage ? [] : ["CASH_ACCOUNT_COVERAGE_INCOMPLETE"],
    });
  }
  if (!trailing3MonthAverageBurnMinorUnits) {
    return metric(context, "finance.cash_runway", null, { warnings: ["NO_BURN_RECORDED"] });
  }
  const cashOnHandMinorUnits = addUsd(
    latest.map(({ balanceMinorUnits }) => usd(balanceMinorUnits)),
  ).minorUnits;
  const dailyBurnMinorUnits = trailing3MonthAverageBurnMinorUnits / 30;
  const runwayDays = Math.round(cashOnHandMinorUnits / dailyBurnMinorUnits);
  return metric(context, "finance.cash_runway", {
    kind: "duration_seconds",
    value: Math.max(runwayDays, 0) * 86_400,
  });
}

/** DEC-018 #9: fires when a SKU's on-hand quantity is below its reorder-point target. */
export function buildLowInventoryAlertMetric(
  context: MetricServiceContext,
  inventory: readonly CombinedInventoryFact[],
  targets: readonly MetricTargetFact[],
): MetricViewModel {
  if (inventory.length === 0) return metric(context, "alerts.low_inventory", null);
  const bySku = groupSum(
    inventory,
    ({ sku }) => sku,
    ({ quantity }) => quantity,
  );
  const reorderPoints = new Map(
    targets
      .filter((target) => target.metricKey === "inventory.reorder_point" && target.scopeValue)
      .map((target) => [target.scopeValue as string, target.targetValue]),
  );
  let triggered = 0;
  let anyThresholdConfigured = false;
  for (const [sku, quantity] of bySku) {
    const threshold = reorderPoints.get(sku) ?? null;
    if (threshold !== null) anyThresholdConfigured = true;
    if (approvedThresholdResult({ actual: quantity, threshold, direction: "below" }) === "triggered") {
      triggered += 1;
    }
  }
  if (!anyThresholdConfigured) {
    return metric(context, "alerts.low_inventory", null, {
      warnings: ["NO_REORDER_POINTS_CONFIGURED"],
    });
  }
  return metric(
    context,
    "alerts.low_inventory",
    {
      kind: "status",
      value:
        triggered === 0
          ? "All SKUs above reorder point"
          : `${triggered} SKU${triggered === 1 ? "" : "s"} below reorder point`,
    },
    { warnings: triggered > 0 ? ["LOW_INVENTORY_TRIGGERED"] : [] },
  );
}

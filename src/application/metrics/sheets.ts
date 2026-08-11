import {
  metricBreakdownViewModelSchema,
  metricTableViewModelSchema,
  type MetricBreakdownViewModel,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";
import { usdFromDecimalNumber } from "@/src/domain/metrics/calculations";

import type { MetricServiceContext } from "./types";
import { createMetricViewModel } from "./view-model";

function text(record: SheetRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(record: SheetRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

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

function latestSnapshots(records: readonly SheetRecord[]): readonly SheetRecord[] {
  const latest = records
    .map((record) => text(record, "snapshot_at"))
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);
  return latest ? records.filter((record) => text(record, "snapshot_at") === latest) : [];
}

function applicableCostRecord(
  costs: readonly SheetRecord[],
  sku: string,
  snapshotDate: string,
): SheetRecord | null {
  const candidates = costs
    .filter((record) => {
      const from = text(record, "effective_from");
      const to = text(record, "effective_to");
      return (
        text(record, "sku") === sku &&
        text(record, "cost_basis") === "landed" &&
        from !== null &&
        from <= snapshotDate &&
        (!to || to >= snapshotDate)
      );
    })
    .sort((left, right) =>
      (text(right, "effective_from") ?? "").localeCompare(text(left, "effective_from") ?? ""),
    );
  return candidates[0] ?? null;
}

function applicableCost(costs: readonly SheetRecord[], sku: string, snapshotDate: string) {
  const record = applicableCostRecord(costs, sku, snapshotDate);
  return record ? numeric(record, "total_unit_cost_usd") : null;
}

export function buildInventoryValueMetric(
  context: MetricServiceContext,
  snapshots: readonly SheetRecord[],
  costs: readonly SheetRecord[],
): MetricViewModel {
  const latest = latestSnapshots(snapshots);
  const selectedCostBases = new Set(
    latest.flatMap((snapshot) => {
      const sku = text(snapshot, "sku");
      const date = text(snapshot, "snapshot_at")?.slice(0, 10);
      const record = sku && date ? applicableCostRecord(costs, sku, date) : null;
      const basis = record ? text(record, "cost_basis") : null;
      return basis ? [basis] : [];
    }),
  );
  let value = 0;
  let valuedRows = 0;
  for (const snapshot of latest) {
    const sku = text(snapshot, "sku");
    const date = text(snapshot, "snapshot_at")?.slice(0, 10);
    const onHand = numeric(snapshot, "on_hand");
    if (!sku || !date || onHand === null) continue;
    const unitCost = applicableCost(costs, sku, date);
    if (unitCost === null) continue;
    // The workbook rule ties to the source by rounding every line first.
    value += Math.round(onHand * unitCost * 100) / 100;
    valuedRows += 1;
  }
  return metric(
    context,
    "inventory.value",
    valuedRows ? { kind: "money", value: usdFromDecimalNumber(value) } : null,
    [
      ...(valuedRows < latest.length ? ["INVENTORY_COST_COVERAGE_PARTIAL"] : []),
      ...latest.flatMap((snapshot) => {
        const sku = text(snapshot, "sku");
        const date = text(snapshot, "snapshot_at")?.slice(0, 10);
        return sku && date && applicableCost(costs, sku, date) === null
          ? [`MISSING_COST:${sku}`]
          : [];
      }),
      ...[...selectedCostBases].map((basis) => `COST_BASIS:${basis}`),
    ],
  );
}

/**
 * The API currently exposes only a rolled-up unit cost. The business rule
 * requires component-level blanks from the authoritative SKU population, so a
 * total cost must never be used to manufacture a reassuring zero.
 */
export function buildMissingSkuCostMetric(
  context: MetricServiceContext,
  skuMaster: readonly SheetRecord[],
  componentCosts: readonly SheetRecord[],
): MetricViewModel {
  const required = ["co_packing_fee_usd", "coconut_sugar_cost_usd", "packaging_cost_usd"];
  if (skuMaster.length === 0 || componentCosts.length === 0) {
    return metric(context, "quality.missing_sku_cost", null, ["MISSING_COST_COMPONENT_SOURCE"]);
  }
  const costsBySku = new Map(
    componentCosts.flatMap((record) => {
      const sku = text(record, "sku");
      return sku ? [[sku, record] as const] : [];
    }),
  );
  const missing = skuMaster.flatMap((skuRecord) => {
    const sku = text(skuRecord, "sku_id");
    if (!sku) return [];
    const cost = costsBySku.get(sku);
    const components = required.filter((field) => !cost || numeric(cost, field) === null);
    return components.length ? [{ sku, components }] : [];
  });
  return metric(
    context,
    "quality.missing_sku_cost",
    { kind: "count", value: missing.length },
    missing.map(({ sku, components }) => `MISSING_COST:${sku}:${components.join(",")}`),
  );
}

export function buildUnclassifiedChannelPendingMetric(
  context: MetricServiceContext,
  mappings: readonly SheetRecord[],
): MetricViewModel {
  return metric(context, "quality.unclassified_channel", null, [
    mappings.length === 0 ? "CHANNEL_MAPPING_REQUIRED" : "CHANNEL_RULE_APPROVAL_REQUIRED",
  ]);
}

export function buildLowInventoryBreakdown(
  context: MetricServiceContext,
  _snapshots: readonly SheetRecord[],
  _targets: readonly SheetRecord[],
): MetricBreakdownViewModel {
  void _snapshots;
  void _targets;
  const base = metric(context, "alerts.low_inventory", null, ["PHASE_2_NOT_CONFIGURED"]);
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "sku",
    items: [],
  });
}

export function buildProductionCostBreakdown(
  context: MetricServiceContext,
  orders: readonly SheetRecord[],
): MetricBreakdownViewModel {
  const seenFreight = new Set<string>();
  const rows = orders.flatMap((record) => {
    const po = text(record, "po_number");
    const units = numeric(record, "units");
    const unitCost = numeric(record, "unit_cost_usd");
    if (!po || units === null || unitCost === null) return [];
    const freight = seenFreight.has(po) ? 0 : (numeric(record, "freight_usd") ?? 0);
    seenFreight.add(po);
    return [{ po, exposure: units * unitCost + freight }];
  });
  const total = rows.reduce((sum, row) => sum + row.exposure, 0);
  const base = metric(
    context,
    "production.cost_payment",
    rows.length ? { kind: "money", value: usdFromDecimalNumber(total) } : null,
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "purchase_order",
    items: rows.map(({ po, exposure }) => ({
      key: po,
      label: po,
      values: [{ kind: "money", value: usdFromDecimalNumber(exposure) }],
      warnings: [],
    })),
  });
}

export function buildMarketingSpendBreakdown(
  context: MetricServiceContext,
  records: readonly SheetRecord[],
): MetricBreakdownViewModel {
  const grouped = new Map<string, { date: string; label: string; spend: number }>();
  for (const record of records) {
    const date = text(record, "date");
    const spend = numeric(record, "spend_usd");
    if (
      !date ||
      spend === null ||
      date < context.dataPeriod.startDate ||
      date > context.dataPeriod.endDate
    )
      continue;
    const platform = text(record, "platform") ?? "Unspecified platform";
    const campaign = text(record, "campaign_name");
    const key = `${date}:${platform}:${campaign ?? ""}`;
    const prior = grouped.get(key);
    grouped.set(key, {
      date,
      label: campaign ? `${date} · ${platform} · ${campaign}` : `${date} · ${platform}`,
      spend: (prior?.spend ?? 0) + spend,
    });
  }
  const total = [...grouped.values()].reduce((sum, value) => sum + value.spend, 0);
  const base = metric(
    context,
    "marketing.spend",
    grouped.size ? { kind: "money", value: usdFromDecimalNumber(total) } : null,
    ["SPEND_ONLY_NO_ATTRIBUTION"],
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "date_platform_campaign",
    items: [...grouped]
      .sort(([, left], [, right]) => left.date.localeCompare(right.date))
      .map(([key, entry]) => ({
        key,
        label: entry.label,
        values: [{ kind: "money", value: usdFromDecimalNumber(entry.spend) }],
        warnings: [],
      })),
  });
}

export function buildCashPositionBreakdown(
  context: MetricServiceContext,
  records: readonly SheetRecord[],
): MetricBreakdownViewModel {
  const grouped = new Map<string, number>();
  for (const record of records) {
    const date = text(record, "as_of_date");
    const balance = numeric(record, "cash_balance_usd");
    if (!date || balance === null) continue;
    grouped.set(date, (grouped.get(date) ?? 0) + balance);
  }
  const latest = [...grouped].sort(([left], [right]) => right.localeCompare(left))[0];
  const base = metric(
    context,
    "finance.cash_position",
    latest ? { kind: "money", value: usdFromDecimalNumber(latest[1]) } : null,
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "date",
    items: [...grouped]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, balance]) => ({
        key: date,
        label: date,
        values: [{ kind: "money", value: usdFromDecimalNumber(balance) }],
        warnings: [],
      })),
  });
}

/**
 * Exposes validated forecast rows without fabricating an actual comparison.
 * A later reconciler can fill actualUnits/varianceUnits when matching Shopify
 * week, SKU, and channel facts are available in the same contribution.
 */
export function buildForecastPendingTable(
  context: MetricServiceContext,
  records: readonly SheetRecord[],
): MetricTableViewModel {
  const grouped = new Map<string, { weekStart: string; sku: string; forecastUnits: number }>();
  for (const record of records) {
    if (text(record, "status") !== "approved") continue;
    const weekStart = text(record, "week_start");
    const sku = text(record, "sku");
    const forecastUnits = numeric(record, "forecast_units");
    if (!weekStart || !sku || forecastUnits === null) continue;
    const key = `${weekStart}:${sku}`;
    const prior = grouped.get(key);
    grouped.set(key, {
      weekStart,
      sku,
      forecastUnits: (prior?.forecastUnits ?? 0) + forecastUnits,
    });
  }
  const rows = [...grouped.values()].map((row) => ({
    ...row,
    channel: "All channels",
    actualUnits: null,
    varianceUnits: null,
    variancePercent: null,
  }));
  const base = metric(context, "forecast.variance", null, ["FORECAST_ACTUAL_MATCH_PENDING"]);
  return metricTableViewModelSchema.parse({
    metric: base,
    columns: [
      "weekStart",
      "sku",
      "channel",
      "forecastUnits",
      "actualUnits",
      "varianceUnits",
      "variancePercent",
    ],
    rows,
  });
}

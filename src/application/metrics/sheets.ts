import {
  metricBreakdownViewModelSchema,
  metricTableViewModelSchema,
  type MetricBreakdownViewModel,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import type { ManualStoreRecord } from "@/src/application/ports/manual-workbook";
import { usdFromDecimalNumber } from "@/src/domain/metrics/calculations";

import type { MetricServiceContext } from "./types";
import { createMetricViewModel } from "./view-model";

function text(record: ManualStoreRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(record: ManualStoreRecord, key: string): number | null {
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

function latestSnapshots(records: readonly ManualStoreRecord[]): readonly ManualStoreRecord[] {
  const latest = records
    .map((record) => text(record, "snapshot_at"))
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);
  return latest ? records.filter((record) => text(record, "snapshot_at") === latest) : [];
}

function applicableCost(
  costs: readonly ManualStoreRecord[],
  sku: string,
  snapshotDate: string,
): number | null {
  const candidates = costs
    .filter((record) => {
      const from = text(record, "effective_from");
      const to = text(record, "effective_to");
      return (
        text(record, "sku") === sku &&
        from !== null &&
        from <= snapshotDate &&
        (!to || to >= snapshotDate)
      );
    })
    .sort((left, right) =>
      (text(right, "effective_from") ?? "").localeCompare(text(left, "effective_from") ?? ""),
    );
  return candidates.length
    ? numeric(candidates[0] as ManualStoreRecord, "total_unit_cost_usd")
    : null;
}

export function buildInventoryValueMetric(
  context: MetricServiceContext,
  snapshots: readonly ManualStoreRecord[],
  costs: readonly ManualStoreRecord[],
): MetricViewModel {
  const latest = latestSnapshots(snapshots);
  let value = 0;
  let valuedRows = 0;
  for (const snapshot of latest) {
    const sku = text(snapshot, "sku");
    const date = text(snapshot, "snapshot_at")?.slice(0, 10);
    const onHand = numeric(snapshot, "on_hand");
    if (!sku || !date || onHand === null) continue;
    const unitCost = applicableCost(costs, sku, date);
    if (unitCost === null) continue;
    value += onHand * unitCost;
    valuedRows += 1;
  }
  return metric(
    context,
    "inventory.value",
    valuedRows ? { kind: "money", value: usdFromDecimalNumber(value) } : null,
    valuedRows < latest.length ? ["INVENTORY_COST_COVERAGE_PARTIAL"] : [],
  );
}

export function buildLowInventoryBreakdown(
  context: MetricServiceContext,
  snapshots: readonly ManualStoreRecord[],
  targets: readonly ManualStoreRecord[],
): MetricBreakdownViewModel {
  const latest = latestSnapshots(snapshots);
  const activeTargets = new Map<string, number>();
  for (const target of targets) {
    if (
      text(target, "metric_key") !== "inventory.reorder_point" ||
      text(target, "scope_type") !== "sku" ||
      text(target, "status") !== "active"
    )
      continue;
    const sku = text(target, "scope_value");
    const value = numeric(target, "target_value");
    const start = text(target, "period_start");
    const end = text(target, "period_end");
    if (
      sku &&
      value !== null &&
      start &&
      end &&
      start <= context.dataPeriod.endDate &&
      end >= context.dataPeriod.startDate
    ) {
      activeTargets.set(sku, value);
    }
  }
  const availableBySku = new Map<string, number>();
  for (const snapshot of latest) {
    const sku = text(snapshot, "sku");
    const available = numeric(snapshot, "available");
    if (sku && available !== null)
      availableBySku.set(sku, (availableBySku.get(sku) ?? 0) + available);
  }
  const items = [...activeTargets].map(([sku, threshold]) => {
    const available = availableBySku.get(sku) ?? 0;
    return { sku, threshold, available, low: available <= threshold };
  });
  const low = items.filter((item) => item.low);
  const base = metric(
    context,
    "alerts.low_inventory",
    items.length
      ? {
          kind: "status",
          value: low.length
            ? `${low.length} SKU(s) below threshold`
            : "All targeted SKUs above threshold",
        }
      : null,
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "sku",
    items: items.map((item) => ({
      key: item.sku,
      label: item.sku,
      values: [{ kind: "quantity", value: item.available }],
      warnings: item.low ? [`REORDER_POINT:${item.threshold}`] : [],
    })),
  });
}

export function buildProductionCostBreakdown(
  context: MetricServiceContext,
  orders: readonly ManualStoreRecord[],
): MetricBreakdownViewModel {
  const rows = orders.flatMap((record) => {
    const po = text(record, "po_number");
    const units = numeric(record, "units");
    const unitCost = numeric(record, "unit_cost_usd");
    if (!po || units === null || unitCost === null) return [];
    const freight = numeric(record, "freight_usd") ?? 0;
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
  records: readonly ManualStoreRecord[],
): MetricBreakdownViewModel {
  const grouped = new Map<string, number>();
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
    grouped.set(date, (grouped.get(date) ?? 0) + spend);
  }
  const total = [...grouped.values()].reduce((sum, value) => sum + value, 0);
  const base = metric(
    context,
    "marketing.spend",
    grouped.size ? { kind: "money", value: usdFromDecimalNumber(total) } : null,
    ["SPEND_ONLY_NO_ATTRIBUTION"],
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "date",
    items: [...grouped]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, spend]) => ({
        key: date,
        label: date,
        values: [{ kind: "money", value: usdFromDecimalNumber(spend) }],
        warnings: [],
      })),
  });
}

export function buildCashPositionBreakdown(
  context: MetricServiceContext,
  records: readonly ManualStoreRecord[],
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
  records: readonly ManualStoreRecord[],
): MetricTableViewModel {
  const rows = records.flatMap((record) => {
    const weekStart = text(record, "week_start");
    const sku = text(record, "sku");
    const channel = text(record, "channel");
    const forecastUnits = numeric(record, "forecast_units");
    if (!weekStart || !sku || !channel || forecastUnits === null) return [];
    return [{ weekStart, sku, channel, forecastUnits, actualUnits: null, varianceUnits: null }];
  });
  const base = metric(context, "forecast.variance", null, ["FORECAST_ACTUAL_MATCH_PENDING"]);
  return metricTableViewModelSchema.parse({
    metric: base,
    columns: ["weekStart", "sku", "channel", "forecastUnits", "actualUnits", "varianceUnits"],
    rows,
  });
}

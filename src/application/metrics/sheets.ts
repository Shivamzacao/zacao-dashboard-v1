import {
  metricBreakdownViewModelSchema,
  metricTableViewModelSchema,
  type MetricBreakdownViewModel,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";
import { usdFromDecimalNumber } from "@/src/domain/metrics/calculations";

import type { ForecastVarianceFact, MetricServiceContext, WeeklyProductUnitsFact } from "./types";
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

interface SnapshotSelection {
  readonly records: readonly SheetRecord[];
  readonly warnings: readonly string[];
}

function latestSnapshots(records: readonly SheetRecord[]): SnapshotSelection {
  const latest = records
    .map((record) => text(record, "snapshot_at"))
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);
  if (!latest) return { records: [], warnings: [] };
  const groups = new Map<string, SheetRecord[]>();
  for (const record of records.filter((row) => text(row, "snapshot_at") === latest)) {
    const warehouse = text(record, "warehouse");
    const sku = text(record, "sku");
    if (!warehouse || !sku) continue;
    const key = `${latest}:${warehouse}:${sku}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const selected: SheetRecord[] = [];
  const warnings: string[] = [];
  for (const [key, duplicates] of groups) {
    const signatures = new Set(
      duplicates.map((record) =>
        ["on_hand", "committed", "available", "damaged", "incoming"]
          .map((field) => String(record[field] ?? ""))
          .join("|"),
      ),
    );
    if (signatures.size > 1) {
      warnings.push(`INVENTORY_DUPLICATE_CONFLICT:${key}`);
      continue;
    }
    const first = duplicates[0];
    if (!first) continue;
    selected.push(first);
    if (duplicates.length > 1) warnings.push(`INVENTORY_DUPLICATE_COLLAPSED:${key}`);
  }
  return { records: selected, warnings };
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
        ["landed", "standard"].includes(text(record, "cost_basis") ?? "") &&
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
    latest.records.flatMap((snapshot) => {
      const sku = text(snapshot, "sku");
      const date = text(snapshot, "snapshot_at")?.slice(0, 10);
      const record = sku && date ? applicableCostRecord(costs, sku, date) : null;
      const basis = record ? text(record, "cost_basis") : null;
      return basis ? [basis] : [];
    }),
  );
  let value = 0;
  let valuedRows = 0;
  for (const snapshot of latest.records) {
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
      ...latest.warnings,
      ...(valuedRows < latest.records.length ? ["INVENTORY_COST_COVERAGE_PARTIAL"] : []),
      ...latest.records.flatMap((snapshot) => {
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
  costs: readonly SheetRecord[],
): MetricViewModel {
  if (skuMaster.length === 0) {
    return metric(context, "quality.missing_sku_cost", null, ["SKU_COST_SOURCE_REQUIRED"]);
  }
  const asOf = context.dataPeriod.endDate;
  const missing = skuMaster.flatMap((skuRecord) => {
    const sku = text(skuRecord, "sku_id");
    if (!sku || text(skuRecord, "is_active") === "no") return [];
    const cost = applicableCost(costs, sku, asOf);
    return cost === null || cost <= 0 ? [sku] : [];
  });
  return metric(
    context,
    "quality.missing_sku_cost",
    { kind: "count", value: missing.length },
    missing.map((sku) => `MISSING_COST:${sku}`),
  );
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function reconcileForecastActuals(
  context: MetricServiceContext,
  forecasts: readonly SheetRecord[],
  skuMaster: readonly SheetRecord[],
  actuals: readonly WeeklyProductUnitsFact[],
): {
  readonly facts: readonly ForecastVarianceFact[];
  readonly warnings: readonly string[];
} {
  const masterByShopifySku = new Map(
    skuMaster.flatMap((record) => {
      const shopifySku = text(record, "shopify_variant_sku");
      const sku = text(record, "sku_id");
      const packSize = numeric(record, "pack_size_bars");
      return shopifySku && sku && packSize && packSize > 0
        ? [[shopifySku, { sku, packSize }] as const]
        : [];
    }),
  );
  const actualByKey = new Map<string, number>();
  const warnings: string[] = [];
  for (const actual of actuals) {
    if (!actual.merchandise || actual.units === 0) continue;
    const mapped = actual.shopifySku ? masterByShopifySku.get(actual.shopifySku) : undefined;
    if (!mapped) {
      warnings.push(`UNMAPPED_SHOPIFY_SKU:${actual.shopifySku ?? "blank"}`);
      continue;
    }
    const key = `${actual.weekStart}:${mapped.sku}:DTC (Shopify)`;
    actualByKey.set(key, (actualByKey.get(key) ?? 0) + actual.units * mapped.packSize);
  }
  const grouped = new Map<
    string,
    { period: string; sku: string; channel: string; forecastUnits: number }
  >();
  for (const record of forecasts) {
    if (text(record, "status") !== "approved") continue;
    const period = text(record, "week_start");
    const sku = text(record, "sku");
    const channel = text(record, "channel");
    const forecastUnits = numeric(record, "forecast_units");
    if (!period || !sku || !channel || forecastUnits === null) continue;
    if (addDays(period, 6) > context.dataPeriod.endDate) continue;
    const key = `${period}:${sku}:${channel}`;
    const prior = grouped.get(key);
    grouped.set(key, {
      period,
      sku,
      channel,
      forecastUnits: (prior?.forecastUnits ?? 0) + forecastUnits,
    });
  }
  return {
    facts: [...grouped].map(([key, row]) => ({ ...row, actualUnits: actualByKey.get(key) ?? 0 })),
    warnings: [...new Set(warnings)],
  };
}

export function buildInventoryRunwayMetric(
  context: MetricServiceContext,
  snapshots: readonly SheetRecord[],
  forecasts: readonly SheetRecord[],
): MetricViewModel {
  const latest = latestSnapshots(snapshots);
  const asOf = latest.records
    .map((row) => text(row, "snapshot_at")?.slice(0, 10) ?? "")
    .sort()
    .at(-1);
  if (!asOf) return metric(context, "inventory.runway_reorder", null, latest.warnings);
  const onHand = latest.records.reduce(
    (sum, row) => sum + (numeric(row, "available") ?? numeric(row, "on_hand") ?? 0),
    0,
  );
  const futureWeeks = [
    ...new Set(
      forecasts.flatMap((row) => {
        const week = text(row, "week_start");
        return text(row, "status") === "approved" && week && week > asOf ? [week] : [];
      }),
    ),
  ]
    .sort()
    .slice(0, 4);
  if (futureWeeks.length < 4) {
    return metric(context, "inventory.runway_reorder", null, [
      ...latest.warnings,
      "FOUR_WEEK_FORECAST_REQUIRED",
    ]);
  }
  const forecastUnits = forecasts.reduce((sum, row) => {
    const week = text(row, "week_start");
    return text(row, "status") === "approved" && week && futureWeeks.includes(week)
      ? sum + (numeric(row, "forecast_units") ?? 0)
      : sum;
  }, 0);
  if (forecastUnits <= 0)
    return metric(context, "inventory.runway_reorder", null, ["ZERO_FORECAST"]);
  return metric(
    context,
    "inventory.runway_reorder",
    {
      kind: "quantity",
      value: Math.round((onHand / (forecastUnits / 28)) * 10) / 10,
    },
    [...latest.warnings, "REORDER_RECOMMENDATION_PHASE_2"],
  );
}

export function buildSellThroughMetric(
  context: MetricServiceContext,
  snapshots: readonly SheetRecord[],
  productionOrders: readonly SheetRecord[],
  actuals: readonly WeeklyProductUnitsFact[],
  skuMaster: readonly SheetRecord[],
): MetricViewModel {
  const openingCandidates = snapshots.filter(
    (row) => (text(row, "snapshot_at")?.slice(0, 10) ?? "") <= context.dataPeriod.startDate,
  );
  const opening = latestSnapshots(openingCandidates);
  if (opening.records.length === 0)
    return metric(context, "inventory.sell_through", null, ["OPENING_INVENTORY_REQUIRED"]);
  const openingUnits = opening.records.reduce(
    (sum, row) => sum + (numeric(row, "available") ?? numeric(row, "on_hand") ?? 0),
    0,
  );
  const received = productionOrders.reduce((sum, row) => {
    const date = text(row, "received_date");
    return date && date >= context.dataPeriod.startDate && date <= context.dataPeriod.endDate
      ? sum + (numeric(row, "received_units") ?? 0)
      : sum;
  }, 0);
  const map = new Map(
    skuMaster.flatMap((row) => {
      const shopifySku = text(row, "shopify_variant_sku");
      const pack = numeric(row, "pack_size_bars");
      return shopifySku && pack && pack > 0 ? [[shopifySku, pack] as const] : [];
    }),
  );
  const sold = actuals.reduce((sum, row) => {
    const pack = row.shopifySku ? map.get(row.shopifySku) : undefined;
    return row.merchandise && pack ? sum + row.units * pack : sum;
  }, 0);
  const denominator = openingUnits + received;
  return denominator > 0
    ? metric(
        context,
        "inventory.sell_through",
        { kind: "rate_basis_points", value: Math.round((sold / denominator) * 10_000) },
        opening.warnings,
      )
    : metric(context, "inventory.sell_through", null, ["SELL_THROUGH_DENOMINATOR_REQUIRED"]);
}

export function buildUnclassifiedChannelMetric(
  context: MetricServiceContext,
  mappings: readonly SheetRecord[],
  channels: readonly string[],
): MetricViewModel {
  const mapped = new Set(
    mappings.flatMap((row) => {
      const source = text(row, "source_system");
      const channel = text(row, "source_channel_or_name");
      const status = text(row, "status");
      return source === "shopify" && channel && status === "active" ? [channel] : [];
    }),
  );
  if (mappings.length === 0)
    return metric(context, "quality.unclassified_channel", null, ["CHANNEL_MAPPING_REQUIRED"]);
  const missing = [...new Set(channels.filter((channel) => !mapped.has(channel)))];
  return metric(
    context,
    "quality.unclassified_channel",
    { kind: "count", value: missing.length },
    missing.map((channel) => `UNCLASSIFIED_CHANNEL:${channel}`),
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

function receivedOrderRows(records: readonly SheetRecord[]) {
  return records.flatMap((record) => {
    const po = text(record, "po_number");
    const expectedDate = text(record, "expected_date");
    const receivedDate = text(record, "received_date");
    const orderedUnits = numeric(record, "units");
    const receivedUnits = numeric(record, "received_units");
    return po && expectedDate && receivedDate && orderedUnits !== null && receivedUnits !== null
      ? [{ po, expectedDate, receivedDate, orderedUnits, receivedUnits }]
      : [];
  });
}

export function hasManufacturerOtifRows(records: readonly SheetRecord[]): boolean {
  return receivedOrderRows(records).length > 0;
}

/**
 * Workbook-backed manufacturer delivery evidence. The current workbook has no
 * accepted/damage-free quantity, so this reports only the two supportable
 * measures: on-time and complete.
 */
export function buildManufacturerOtifBreakdown(
  context: MetricServiceContext,
  records: readonly SheetRecord[],
  warnings: readonly string[] = [],
): MetricBreakdownViewModel {
  const rows = receivedOrderRows(records);
  const rate = (count: number) => (rows.length ? Math.round((count / rows.length) * 10_000) : null);
  const onTime = rate(rows.filter((row) => row.receivedDate <= row.expectedDate).length);
  const complete = rate(rows.filter((row) => row.receivedUnits >= row.orderedUnits).length);
  const otif = rate(
    rows.filter(
      (row) => row.receivedDate <= row.expectedDate && row.receivedUnits >= row.orderedUnits,
    ).length,
  );
  const base = metric(
    context,
    "operations.manufacturer_otif",
    otif === null ? null : { kind: "rate_basis_points", value: otif },
    warnings,
  );
  const items = [
    ["on-time", "On-time", onTime],
    ["complete", "Complete", complete],
    ["otif", "On-time & complete", otif],
  ] as const;
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "manufacturer_delivery_measure",
    items: items.flatMap(([key, label, value]) =>
      value === null
        ? []
        : [{ key, label, values: [{ kind: "rate_basis_points", value }], warnings: [] }],
    ),
  });
}

const COST_COMPONENTS = [
  ["production_cost_usd", "Production"],
  ["packaging_usd", "Packaging"],
  ["freight_usd", "Freight"],
  ["total_unit_cost_usd", "Total landed COGS"],
] as const;

function subtractMonths(date: string, months: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() - months);
  return value.toISOString().slice(0, 10);
}

function costPeriodAverages(records: readonly SheetRecord[], date: string) {
  const rows = records.filter(
    (record) => text(record, "effective_from") === date && text(record, "cost_basis") === "landed",
  );
  return new Map(
    COST_COMPONENTS.flatMap(([key]) => {
      const values = rows.flatMap((record) => {
        const value = numeric(record, key);
        return value === null ? [] : [value];
      });
      return values.length
        ? ([[key, values.reduce((sum, value) => sum + value, 0) / values.length]] as const)
        : [];
    }),
  );
}

export function hasComparableInputCostRows(
  records: readonly SheetRecord[],
  endDate: string,
): boolean {
  const dates = [
    ...new Set(
      records.flatMap((record) => {
        const date = text(record, "effective_from");
        return text(record, "cost_basis") === "landed" && date && date <= endDate ? [date] : [];
      }),
    ),
  ].sort();
  const latest = dates.at(-1);
  return latest ? dates.some((date) => date <= subtractMonths(latest, 3)) : false;
}

/** Compare like-for-like landed cost components with the latest period three months earlier. */
export function buildInputCostMovementBreakdown(
  context: MetricServiceContext,
  records: readonly SheetRecord[],
  warnings: readonly string[] = [],
): MetricBreakdownViewModel {
  const dates = [
    ...new Set(
      records.flatMap((record) => {
        const date = text(record, "effective_from");
        return text(record, "cost_basis") === "landed" && date && date <= context.dataPeriod.endDate
          ? [date]
          : [];
      }),
    ),
  ].sort();
  const latestDate = dates.at(-1) ?? null;
  const priorDate = latestDate
    ? (dates.filter((date) => date <= subtractMonths(latestDate, 3)).at(-1) ?? null)
    : null;
  const latest = latestDate ? costPeriodAverages(records, latestDate) : new Map<string, number>();
  const prior = priorDate ? costPeriodAverages(records, priorDate) : new Map<string, number>();
  const movement = new Map(
    COST_COMPONENTS.flatMap(([key]) => {
      const current = latest.get(key);
      const previous = prior.get(key);
      return current !== undefined && previous !== undefined && previous !== 0
        ? ([[key, Math.round(((current - previous) / Math.abs(previous)) * 10_000)]] as const)
        : [];
    }),
  );
  const totalMovement = movement.get("total_unit_cost_usd") ?? null;
  const periodWarnings =
    latestDate && priorDate ? [`COMPARISON_PERIODS:${priorDate}:${latestDate}`] : [];
  const base = metric(
    context,
    "manufacturing.input_cost_movement",
    totalMovement === null ? null : { kind: "rate_basis_points", value: totalMovement },
    [...warnings, ...periodWarnings],
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "cost_component",
    items: COST_COMPONENTS.flatMap(([key, label]) => {
      const value = movement.get(key);
      return value === undefined
        ? []
        : [{ key, label, values: [{ kind: "rate_basis_points", value }], warnings: [] }];
    }),
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

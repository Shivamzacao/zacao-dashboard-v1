import {
  metricBreakdownViewModelSchema,
  metricTableViewModelSchema,
  type MetricBreakdownViewModel,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";

import { resolvePackVariantSibling } from "./pack-variants";

import type {
  InventoryFact,
  MetricServiceContext,
  ProductSalesFact,
  ProductUnitsFact,
  WeeklyProductUnitsFact,
} from "./types";
import { buildSellThroughMetric } from "./sheets";
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

interface SkuMapping {
  readonly canonicalSku: string;
  readonly canonicalName: string;
  readonly shopifySku: string;
  readonly packSizeBars: number;
}

function skuMappings(records: readonly SheetRecord[]): ReadonlyMap<string, SkuMapping> {
  return new Map(
    records.flatMap((record) => {
      const canonicalSku = text(record, "sku_id");
      const canonicalName = text(record, "canonical_name");
      const shopifySku = text(record, "shopify_variant_sku");
      const packSizeBars = numeric(record, "pack_size_bars");
      return canonicalSku &&
        canonicalName &&
        shopifySku &&
        packSizeBars !== null &&
        packSizeBars > 0 &&
        text(record, "is_active") !== "no"
        ? [[shopifySku, { canonicalSku, canonicalName, shopifySku, packSizeBars }] as const]
        : [];
    }),
  );
}

export function hasProductSkuMappings(records: readonly SheetRecord[]): boolean {
  return skuMappings(records).size > 0;
}

function applicableLandedCost(
  records: readonly SheetRecord[],
  canonicalSku: string,
  endDate: string,
): number | null {
  const row = records
    .filter((record) => {
      const from = text(record, "effective_from");
      const to = text(record, "effective_to");
      return (
        text(record, "sku") === canonicalSku &&
        text(record, "cost_basis") === "landed" &&
        from !== null &&
        from <= endDate &&
        (!to || to >= endDate)
      );
    })
    .sort((left, right) =>
      (text(right, "effective_from") ?? "").localeCompare(text(left, "effective_from") ?? ""),
    )[0];
  return row ? numeric(row, "total_unit_cost_usd") : null;
}

export function hasApplicableProductLandedCosts(
  records: readonly SheetRecord[],
  endDate: string,
): boolean {
  return records.some((record) => {
    const sku = text(record, "sku");
    return sku ? applicableLandedCost(records, sku, endDate) !== null : false;
  });
}

/** Explicit mapping first; otherwise derive the pack variant from a mapped sibling. */
function resolveInventoryMapping(
  shopifySku: string,
  byShopifySku: ReadonlyMap<string, SkuMapping>,
): SkuMapping | undefined {
  const explicit = byShopifySku.get(shopifySku);
  if (explicit) return explicit;
  const derived = resolvePackVariantSibling(
    shopifySku,
    byShopifySku.keys(),
    (candidate) => byShopifySku.get(candidate)?.canonicalSku ?? null,
  );
  if (!derived) return undefined;
  const sibling = byShopifySku.get(derived.siblingShopifySku);
  return sibling ? { ...sibling, shopifySku, packSizeBars: derived.packSizeBars } : undefined;
}

export function buildProductInventoryBreakdown(
  context: MetricServiceContext,
  inventory: readonly InventoryFact[],
  mappings: readonly SheetRecord[],
  warnings: readonly string[] = [],
): MetricBreakdownViewModel {
  const byShopifySku = skuMappings(mappings);
  const grouped = new Map<string, { label: string; bars: number }>();
  const unmapped = new Set<string>();
  for (const fact of inventory.filter(({ quantityName }) => quantityName === "on_hand")) {
    // SKU_Master maps the four-pack only, so an unmapped pack variant of the same
    // product resolves through its sibling rather than dropping its stock.
    const mapping = fact.sku ? resolveInventoryMapping(fact.sku, byShopifySku) : undefined;
    if (!mapping) {
      unmapped.add(fact.sku ?? "blank");
      continue;
    }
    const prior = grouped.get(mapping.canonicalSku);
    grouped.set(mapping.canonicalSku, {
      label: mapping.canonicalName,
      bars: (prior?.bars ?? 0) + fact.quantity * mapping.packSizeBars,
    });
  }
  const total = [...grouped.values()].reduce((sum, item) => sum + item.bars, 0);
  const metricWarnings = [
    ...warnings,
    ...[...unmapped].map((sku) => `UNMAPPED_SHOPIFY_SKU:${sku}`),
  ];
  const base = metric(
    context,
    "inventory.on_hand_bars",
    grouped.size ? { kind: "quantity", value: total } : null,
    metricWarnings,
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "canonical_sku",
    items: [...grouped].map(([key, item]) => ({
      key,
      label: item.label,
      values: [{ kind: "quantity", value: item.bars }],
      warnings: [],
    })),
  });
}

export function buildProductWeeksCoverMetric(
  context: MetricServiceContext,
  inventory: readonly InventoryFact[],
  trailingUnits: readonly ProductUnitsFact[],
  mappings: readonly SheetRecord[],
  warnings: readonly string[] = [],
): MetricViewModel {
  const byShopifySku = skuMappings(mappings);
  // Same pack-variant resolution as the inventory breakdown: the ten-pack carries
  // most of the sellable stock and is not mapped in SKU_Master, so an explicit-only
  // lookup leaves availableBars at zero and the metric permanently unavailable.
  const availableBars = inventory.reduce((sum, fact) => {
    if (fact.quantityName !== "available" || !fact.sku) return sum;
    const mapping = resolveInventoryMapping(fact.sku, byShopifySku);
    return mapping ? sum + fact.quantity * mapping.packSizeBars : sum;
  }, 0);
  const soldBars = trailingUnits.reduce((sum, fact) => {
    if (!fact.merchandise || !fact.sku) return sum;
    const mapping = resolveInventoryMapping(fact.sku, byShopifySku);
    return mapping ? sum + fact.units * mapping.packSizeBars : sum;
  }, 0);
  return metric(
    context,
    "inventory.weeks_cover",
    availableBars > 0 && soldBars > 0
      ? { kind: "quantity", value: Math.round((availableBars / soldBars) * 4 * 10) / 10 }
      : null,
    warnings,
  );
}

export function buildProductSkuMarginViews(input: {
  readonly context: MetricServiceContext;
  readonly sales: readonly ProductSalesFact[];
  readonly units: readonly ProductUnitsFact[];
  readonly mappings: readonly SheetRecord[];
  readonly costs: readonly SheetRecord[];
  readonly warnings?: readonly string[];
}): { readonly breakdown: MetricBreakdownViewModel; readonly table: MetricTableViewModel } {
  const byShopifySku = skuMappings(input.mappings);
  const salesBySku = new Map<string, number>();
  const unitsBySku = new Map<string, number>();
  const unmapped = new Set<string>();
  for (const fact of input.sales.filter(({ merchandise }) => merchandise)) {
    if (!fact.sku || !byShopifySku.has(fact.sku)) {
      unmapped.add(fact.sku ?? "blank");
      continue;
    }
    salesBySku.set(fact.sku, (salesBySku.get(fact.sku) ?? 0) + fact.netSalesMinorUnits);
  }
  for (const fact of input.units.filter(({ merchandise }) => merchandise)) {
    if (!fact.sku || !byShopifySku.has(fact.sku)) continue;
    unitsBySku.set(fact.sku, (unitsBySku.get(fact.sku) ?? 0) + fact.units);
  }
  const rows = [...salesBySku].flatMap(([shopifySku, revenueMinorUnits]) => {
    const mapping = byShopifySku.get(shopifySku);
    if (!mapping) return [];
    const units = unitsBySku.get(shopifySku) ?? 0;
    const cost = applicableLandedCost(
      input.costs,
      mapping.canonicalSku,
      input.context.dataPeriod.endDate,
    );
    const cogsPerBarMinorUnits = cost === null ? null : Math.round(cost * 100);
    const totalCogs =
      cogsPerBarMinorUnits === null ? null : units * mapping.packSizeBars * cogsPerBarMinorUnits;
    const marginBasisPoints =
      totalCogs === null || revenueMinorUnits <= 0
        ? null
        : Math.round(((revenueMinorUnits - totalCogs) / revenueMinorUnits) * 10_000);
    return [
      {
        key: mapping.canonicalSku,
        label: mapping.canonicalName,
        sku: mapping.canonicalSku,
        units,
        revenueMinorUnits,
        cogsPerBarMinorUnits,
        targetPerBarMinorUnits: null,
        marginBasisPoints,
        status: marginBasisPoints === null ? "Cost unavailable" : "Demo cost; target unavailable",
        totalCogs,
      },
    ];
  });
  const covered = rows.filter(
    (row): row is (typeof rows)[number] & { totalCogs: number; marginBasisPoints: number } =>
      row.totalCogs !== null && row.marginBasisPoints !== null && row.revenueMinorUnits > 0,
  );
  const coveredRevenue = covered.reduce((sum, row) => sum + row.revenueMinorUnits, 0);
  const coveredCogs = covered.reduce((sum, row) => sum + row.totalCogs, 0);
  const headline =
    coveredRevenue > 0
      ? Math.round(((coveredRevenue - coveredCogs) / coveredRevenue) * 10_000)
      : null;
  const metricWarnings = [
    ...(input.warnings ?? []),
    ...[...unmapped].map((sku) => `UNMAPPED_SHOPIFY_SKU:${sku}`),
    ...(covered.length < rows.length ? ["SKU_MARGIN_COST_COVERAGE_PARTIAL"] : []),
  ];
  const base = metric(
    input.context,
    "products.sku_margin",
    headline === null ? null : { kind: "rate_basis_points", value: headline },
    metricWarnings,
  );
  return {
    breakdown: metricBreakdownViewModelSchema.parse({
      metric: base,
      dimension: "canonical_sku",
      items: rows.flatMap((row) =>
        row.marginBasisPoints === null
          ? []
          : [
              {
                key: row.key,
                label: row.label,
                values: [{ kind: "rate_basis_points", value: row.marginBasisPoints }],
                warnings: [],
              },
            ],
      ),
    }),
    table: metricTableViewModelSchema.parse({
      metric: base,
      columns: [
        "sku",
        "units",
        "revenueMinorUnits",
        "cogsPerBarMinorUnits",
        "targetPerBarMinorUnits",
        "marginBasisPoints",
        "status",
      ],
      rows: rows.map((row) => ({
        sku: row.sku,
        units: row.units,
        revenueMinorUnits: row.revenueMinorUnits,
        cogsPerBarMinorUnits: row.cogsPerBarMinorUnits,
        targetPerBarMinorUnits: row.targetPerBarMinorUnits,
        marginBasisPoints: row.marginBasisPoints,
        status: row.status,
      })),
    }),
  };
}

export function hasOpeningInventoryRows(
  records: readonly SheetRecord[],
  startDate: string,
): boolean {
  return records.some((record) => (text(record, "snapshot_at")?.slice(0, 10) ?? "") <= startDate);
}

export function hasReceivedProductionRows(
  records: readonly SheetRecord[],
  startDate: string,
  endDate: string,
): boolean {
  return records.some((record) => {
    const received = text(record, "received_date");
    return received !== null && received >= startDate && received <= endDate;
  });
}

export function buildProductSellThroughMetric(
  context: MetricServiceContext,
  snapshots: readonly SheetRecord[],
  productionOrders: readonly SheetRecord[],
  actuals: readonly WeeklyProductUnitsFact[],
  mappings: readonly SheetRecord[],
): MetricViewModel {
  // Keep the established, audited sell-through implementation as the single
  // calculation source; this wrapper makes the product contributor explicit.
  return buildSellThroughMetric(context, snapshots, productionOrders, actuals, mappings);
}

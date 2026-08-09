import type {
  MetricBreakdownViewModel,
  MetricTableViewModel,
  MetricViewModel,
} from "@/src/application/view-models";
import {
  metricBreakdownViewModelSchema,
  metricTableViewModelSchema,
} from "@/src/application/view-models";
import { sumSafeNumbers } from "@/src/domain/metrics/calculations";
import { usd } from "@/src/domain/utilities/money";

import type {
  CatalogVariantFact,
  CustomerClassificationSummary,
  InventoryFact,
  MetricServiceContext,
  ProductUnitsFact,
  ShopifyFunnelFact,
} from "./types";
import { createMetricViewModel } from "./view-model";

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

export function buildCustomerClassificationMetrics(
  context: MetricServiceContext,
  summary: CustomerClassificationSummary,
): readonly MetricViewModel[] {
  const facts = summary.rows;
  const newCustomers = sumSafeNumbers(
    facts
      .filter(({ classification }) => classification === "new")
      .map(({ customers }) => customers),
  );
  const returningCustomers = sumSafeNumbers(
    facts
      .filter(({ classification }) => classification === "returning")
      .map(({ customers }) => customers),
  );
  const unclassified = sumSafeNumbers(
    facts
      .filter(({ classification }) => classification === "unclassified")
      .map(({ customers }) => customers),
  );
  const warnings = unclassified > 0 ? ["UNCLASSIFIED_CUSTOMER_ROWS"] : [];
  return [
    metric(context, "customers.new_count", { kind: "count", value: newCustomers }, warnings),
    metric(
      context,
      "customers.returning_count",
      { kind: "count", value: returningCustomers },
      warnings,
    ),
    metric(
      context,
      "customers.returning_rate",
      summary.returningRateBasisPoints === null
        ? null
        : { kind: "rate_basis_points", value: summary.returningRateBasisPoints },
      warnings,
    ),
  ];
}

export function buildShopifyFunnelMetrics(
  context: MetricServiceContext,
  fact: ShopifyFunnelFact | null,
): readonly MetricViewModel[] {
  if (!fact) return [metric(context, "commerce.web_funnel", null)];
  const funnelMetric = metric(context, "commerce.web_funnel", {
    kind: "rate_basis_points",
    value: fact.conversionRateBasisPoints,
  });
  return [funnelMetric];
}

export function buildShopifyFunnelTable(
  context: MetricServiceContext,
  fact: ShopifyFunnelFact | null,
): MetricTableViewModel {
  const base = buildShopifyFunnelMetrics(context, fact)[0];
  if (!base) throw new Error("Funnel metric contract is missing");
  return metricTableViewModelSchema.parse({
    metric: base,
    columns: ["stage", "count"],
    rows: fact
      ? [
          { stage: "Sessions", count: fact.sessions },
          { stage: "Visitors", count: fact.visitors },
          { stage: "Cart additions", count: fact.cartAdditions },
          { stage: "Reached checkout", count: fact.reachedCheckout },
          { stage: "Completed checkout", count: fact.completedCheckout },
        ]
      : [],
  });
}

export function buildProductUnitsBreakdown(
  context: MetricServiceContext,
  facts: readonly ProductUnitsFact[],
): MetricBreakdownViewModel {
  const merchandise = facts.filter(({ merchandise }) => merchandise);
  const grouped = new Map<string, number[]>();
  for (const fact of merchandise) {
    const key = fact.sku ?? `UNMAPPED:${fact.product}:${fact.variant ?? ""}`;
    grouped.set(key, [...(grouped.get(key) ?? []), fact.units]);
  }
  const total = sumSafeNumbers(merchandise.map(({ units }) => units));
  const warnings = facts.length === merchandise.length ? [] : ["NON_MERCHANDISE_ROWS_EXCLUDED"];
  const base = metric(
    context,
    "products.units_sold",
    facts.length === 0 ? null : { kind: "count", value: total },
    warnings,
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "sku",
    items: [...grouped.entries()].map(([key, values]) => ({
      key,
      label: key,
      values: [{ kind: "count", value: sumSafeNumbers(values) }],
      warnings: key.startsWith("UNMAPPED:") ? ["MISSING_SKU"] : [],
    })),
  });
}

export function buildProductVelocityTable(
  context: MetricServiceContext,
  facts: readonly ProductUnitsFact[],
): MetricTableViewModel {
  const rows = facts
    .filter(({ merchandise }) => merchandise)
    .map((fact) => ({
      period: fact.period,
      product: fact.product,
      variant: fact.variant,
      sku: fact.sku,
      units: fact.units,
    }));
  const base = metric(
    context,
    "products.units_velocity",
    rows.length === 0
      ? null
      : { kind: "count", value: sumSafeNumbers(rows.map(({ units }) => units)) },
  );
  return metricTableViewModelSchema.parse({
    metric: base,
    columns: ["period", "product", "variant", "sku", "units"],
    rows,
  });
}

export function buildCatalogTable(
  context: MetricServiceContext,
  facts: readonly CatalogVariantFact[],
): MetricTableViewModel {
  const base = metric(
    context,
    "products.catalog",
    facts.length === 0 ? null : { kind: "status", value: "Current catalog" },
  );
  return metricTableViewModelSchema.parse({
    metric: base,
    // Shopify GIDs (`gid://shopify/ProductVariant/…`) name nothing a reader can
    // act on and are wide enough to squeeze out the columns that do, so the
    // catalog carries the human-facing attributes only. SKU remains the
    // identifier readers actually reconcile against.
    columns: ["product", "variant", "sku", "status", "priceMinorUnits"],
    rows: facts.map((fact) => ({
      product: fact.productTitle,
      variant: fact.variantTitle,
      sku: fact.sku,
      status: fact.productStatus,
      priceMinorUnits: fact.priceMinorUnits,
    })),
  });
}

export function buildMissingCostMetric(
  context: MetricServiceContext,
  facts: readonly CatalogVariantFact[],
): MetricViewModel {
  const missing = facts.filter(
    ({ activeOrSold, unitCostMinorUnits }) => activeOrSold && unitCostMinorUnits === null,
  );
  return metric(
    context,
    "quality.missing_sku_cost",
    {
      kind: "count",
      value: missing.length,
    },
    missing.map(({ sku, variantId }) => `MISSING_COST:${sku ?? variantId}`),
  );
}

/** Shopify quantity names arrive snake_cased; readers see prose. */
const INVENTORY_QUANTITY_LABELS: Readonly<Record<string, string>> = {
  available: "Available",
  committed: "Committed",
  damaged: "Damaged",
  incoming: "Incoming",
  on_hand: "On hand",
  quality_control: "Quality control",
  reserved: "Reserved",
  safety_stock: "Safety stock",
};

function inventoryQuantityLabel(quantityName: string): string {
  const known = INVENTORY_QUANTITY_LABELS[quantityName];
  if (known) return known;
  const words = quantityName.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface InventoryGroup {
  readonly label: string;
  readonly mappedSku: boolean;
  readonly quantities: number[];
}

export function buildInventoryBreakdown(
  context: MetricServiceContext,
  facts: readonly InventoryFact[],
): MetricBreakdownViewModel {
  // Location GIDs stay in the grouping key — they keep it unique — but never
  // in the label: a chart axis reading `gid://shopify/Location/111934701875`
  // tells a reader nothing. The location name only earns its space once more
  // than one location reports.
  const multipleLocations = new Set(facts.map(({ locationId }) => locationId)).size > 1;
  const grouped = new Map<string, InventoryGroup>();
  for (const fact of facts) {
    const key = `${fact.locationId}:${fact.sku ?? "UNMAPPED"}:${fact.quantityName}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantities.push(fact.quantity);
      continue;
    }
    const parts = [
      ...(multipleLocations ? [fact.locationName] : []),
      fact.sku ?? "Unmapped SKU",
      inventoryQuantityLabel(fact.quantityName),
    ];
    grouped.set(key, {
      label: parts.join(" · "),
      mappedSku: fact.sku !== null,
      quantities: [fact.quantity],
    });
  }
  const total = sumSafeNumbers(facts.map(({ quantity }) => quantity));
  const base = metric(
    context,
    "inventory.shopify_current",
    facts.length === 0 ? null : { kind: "count", value: total },
    ["SHOPIFY_LOCATIONS_ONLY"],
  );
  return metricBreakdownViewModelSchema.parse({
    metric: base,
    dimension: "location_sku_quantity",
    items: [...grouped.entries()].map(([key, group]) => ({
      key,
      label: group.label,
      values: [{ kind: "count", value: sumSafeNumbers(group.quantities) }],
      warnings: group.mappedSku ? [] : ["MISSING_SKU"],
    })),
  });
}

export function blockedCommerceMetric(
  context: MetricServiceContext,
  metricKey: string,
): MetricViewModel {
  return metric(context, metricKey, null);
}

export function testMoneyValue(minorUnits: number) {
  return { kind: "money" as const, value: usd(minorUnits) };
}

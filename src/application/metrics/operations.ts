import {
  metricBreakdownViewModelSchema,
  metricTableViewModelSchema,
  type MetricBreakdownViewModel,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";
import type { InventoryFact } from "./types";
import { ratioToBasisPoints } from "@/src/domain/utilities/money";

import type { MetricServiceContext } from "./types";
import { createMetricViewModel } from "./view-model";

function text(record: SheetRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(record: SheetRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metric(
  context: MetricServiceContext,
  metricKey: string,
  value: Parameters<typeof createMetricViewModel>[0]["value"],
  warnings: readonly string[] = [],
  dataPendingReason?: string,
): MetricViewModel {
  return createMetricViewModel({
    metricKey,
    environment: context.environment,
    dataPeriod: context.dataPeriod,
    sources: context.sourceStatuses,
    value,
    warnings,
    ...(dataPendingReason ? { dataPendingReason } : {}),
  });
}

function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end.slice(0, 10)}T00:00:00Z`) - Date.parse(`${start.slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );
}

interface PurchaseOrder {
  readonly number: string;
  readonly rows: readonly SheetRecord[];
}

function purchaseOrders(records: readonly SheetRecord[]): readonly PurchaseOrder[] {
  const grouped = new Map<string, SheetRecord[]>();
  for (const row of records) {
    const po = text(row, "po_number");
    if (!po || text(row, "status") === "cancelled") continue;
    grouped.set(po, [...(grouped.get(po) ?? []), row]);
  }
  return [...grouped].map(([number, rows]) => ({ number, rows }));
}

function dueDate(po: PurchaseOrder): string | null {
  const dates = po.rows.map((row) => text(row, "expected_date"));
  return dates.every((date): date is string => date !== null)
    ? (dates.sort().at(-1) ?? null)
    : null;
}

function finalReceipt(po: PurchaseOrder): string | null {
  const dates = po.rows.map((row) => text(row, "received_date"));
  return dates.every((date): date is string => date !== null)
    ? (dates.sort().at(-1) ?? null)
    : null;
}

function sumRows(po: PurchaseOrder, key: string): number | null {
  const values = po.rows.map((row) => number(row, key));
  return values.every((value): value is number => value !== null)
    ? values.reduce((sum, value) => sum + value, 0)
    : null;
}

function everyLineReceivedOnTime(po: PurchaseOrder): boolean {
  return po.rows.every((row) => {
    const promised = text(row, "expected_date");
    const received = text(row, "received_date");
    return promised !== null && received !== null && received <= promised;
  });
}

export function buildManufacturerOperationsViews(
  context: MetricServiceContext,
  records: readonly SheetRecord[],
): {
  readonly metrics: readonly MetricViewModel[];
  readonly performance: MetricBreakdownViewModel;
  readonly timeline: MetricTableViewModel;
} {
  const orders = purchaseOrders(records);
  const due = orders.filter((po) => {
    const date = dueDate(po);
    return date && date >= context.dataPeriod.startDate && date <= context.dataPeriod.endDate;
  });
  const onTime = due.filter(everyLineReceivedOnTime).length;
  const complete = due.filter((po) => {
    const ordered = sumRows(po, "units");
    const received = sumRows(po, "received_units");
    return ordered !== null && received !== null && received >= ordered;
  }).length;
  const otif = due.filter((po) => {
    const ordered = sumRows(po, "units");
    const received = sumRows(po, "received_units");
    return (
      everyLineReceivedOnTime(po) && ordered !== null && received !== null && received >= ordered
    );
  }).length;
  const receivedOrders = orders.flatMap((po) => {
    const receivedAt = finalReceipt(po);
    const confirmedDates = po.rows.map((row) => text(row, "confirmed_date"));
    const confirmed = confirmedDates.every((date): date is string => date !== null)
      ? (confirmedDates.sort()[0] ?? null)
      : null;
    return confirmed && receivedAt ? [{ po, confirmed, receivedAt }] : [];
  });
  const leadDays = receivedOrders.map(({ confirmed, receivedAt }) =>
    daysBetween(confirmed, receivedAt),
  );
  const damageEligible = orders.flatMap((po) => {
    const received = sumRows(po, "received_units");
    const accepted = sumRows(po, "accepted_units");
    return received !== null && received > 0 && accepted !== null ? [{ received, accepted }] : [];
  });
  const damageReceived = damageEligible.reduce((sum, row) => sum + row.received, 0);
  const damageAccepted = damageEligible.reduce((sum, row) => sum + row.accepted, 0);
  const otifBasisPoints = ratioToBasisPoints(otif, due.length);
  const onTimeBasisPoints = ratioToBasisPoints(onTime, due.length);
  const completeBasisPoints = ratioToBasisPoints(complete, due.length);
  const damageFreeBasisPoints = ratioToBasisPoints(damageAccepted, damageReceived);
  const warnings = [
    `MANUFACTURER_DUE_PO_DENOMINATOR:${due.length}`,
    `DAMAGE_FREE_RECEIVED_PO_DENOMINATOR:${damageEligible.length}`,
  ];
  const metrics = [
    metric(
      context,
      "operations.manufacturer_otif",
      otifBasisPoints === null ? null : { kind: "rate_basis_points", value: otifBasisPoints },
      warnings,
      "Eligible non-cancelled purchase orders due in the selected period are required.",
    ),
    metric(
      context,
      "operations.manufacturer_lead_time",
      leadDays.length
        ? {
            kind: "quantity",
            value: leadDays.reduce((sum, value) => sum + value, 0) / leadDays.length,
          }
        : null,
      [`MANUFACTURER_RECEIVED_PO_DENOMINATOR:${leadDays.length}`],
      "Confirmed dates and final receipts are required.",
    ),
  ];
  const performanceMetric = metric(
    context,
    "operations.manufacturer_performance",
    otifBasisPoints === null ? null : { kind: "rate_basis_points", value: otifBasisPoints },
    warnings,
    "Eligible production-order and receiving records are required.",
  );
  const performance = metricBreakdownViewModelSchema.parse({
    metric: performanceMetric,
    dimension: "manufacturer_measure",
    items: [
      {
        key: "damage-free",
        label: "Damage-free",
        values:
          damageFreeBasisPoints === null
            ? []
            : [{ kind: "rate_basis_points", value: damageFreeBasisPoints }],
        warnings,
      },
      {
        key: "complete",
        label: "Complete & correct",
        values:
          completeBasisPoints === null
            ? []
            : [{ kind: "rate_basis_points", value: completeBasisPoints }],
        warnings,
      },
      {
        key: "on-time",
        label: "On time",
        values:
          onTimeBasisPoints === null
            ? []
            : [{ kind: "rate_basis_points", value: onTimeBasisPoints }],
        warnings,
      },
    ],
  });
  const timelineRows = orders.flatMap((po) =>
    po.rows.flatMap((row) => {
      const startDate = text(row, "production_start_date");
      const endDate = text(row, "expected_date");
      const item = text(row, "sku");
      const quantity = number(row, "units");
      return startDate && endDate && item && quantity !== null
        ? [
            {
              poNumber: po.number,
              item,
              quantity,
              startDate,
              endDate,
              status: text(row, "status"),
            },
          ]
        : [];
    }),
  );
  const timelineMetric = metric(
    context,
    "production.delivery_timeline",
    timelineRows.length
      ? { kind: "status", value: `${timelineRows.length} scheduled items` }
      : null,
    timelineRows.length < orders.reduce((sum, po) => sum + po.rows.length, 0)
      ? ["TIMELINE_ROWS_WITH_MISSING_DATES"]
      : [],
    "Production start and expected arrival dates are required.",
  );
  return {
    metrics,
    performance,
    timeline: metricTableViewModelSchema.parse({
      metric: timelineMetric,
      columns: ["poNumber", "item", "quantity", "startDate", "endDate", "status"],
      rows: timelineRows,
    }),
  };
}

export function buildWarehouseAccuracyMetric(
  context: MetricServiceContext,
  records: readonly SheetRecord[],
): MetricViewModel {
  const eligible = records.filter((row) => {
    const shipped = text(row, "shipped_at");
    return (
      shipped !== null &&
      shipped.slice(0, 10) >= context.dataPeriod.startDate &&
      shipped.slice(0, 10) <= context.dataPeriod.endDate &&
      text(row, "promised_ship_at") !== null &&
      text(row, "pick_accurate") !== null
    );
  });
  const passing = eligible.filter(
    (row) =>
      (text(row, "shipped_at") ?? "") <= (text(row, "promised_ship_at") ?? "") &&
      text(row, "pick_accurate") === "yes",
  ).length;
  const value = ratioToBasisPoints(passing, eligible.length);
  return metric(
    context,
    "operations.warehouse_on_time_accuracy",
    value === null ? null : { kind: "rate_basis_points", value },
    [`WAREHOUSE_COMPLETE_SHIPPED_DENOMINATOR:${eligible.length}`],
    "Complete shipped records with promise and pick-accuracy outcomes are required.",
  );
}

function monthStart(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function nextFourCompleteMonths(asOf: string): readonly string[] {
  const value = new Date(`${asOf.slice(0, 10)}T00:00:00Z`);
  return Array.from({ length: 4 }, (_, index) =>
    monthStart(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + index + 1, 1))),
  );
}

export function buildPackagingViews(
  context: MetricServiceContext,
  materials: readonly SheetRecord[],
  inventory: readonly SheetRecord[],
  orders: readonly SheetRecord[],
  forecasts: readonly SheetRecord[],
): {
  readonly stock: MetricBreakdownViewModel;
  readonly projection: MetricBreakdownViewModel;
  readonly table: MetricTableViewModel;
} {
  const asOf = inventory
    .map((row) => text(row, "snapshot_date"))
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);
  const activeCandidates = materials.filter((row) => {
    const from = text(row, "effective_from");
    const to = text(row, "effective_to");
    return (
      text(row, "is_active") === "yes" &&
      from !== null &&
      (!asOf || from <= asOf) &&
      (!to || !asOf || to >= asOf)
    );
  });
  const activeById = new Map<string, SheetRecord[]>();
  for (const row of activeCandidates) {
    const id = text(row, "material_id");
    if (id) activeById.set(id, [...(activeById.get(id) ?? []), row]);
  }
  const activeRulesComplete =
    activeCandidates.length > 0 &&
    activeCandidates.every((row) => {
      const id = text(row, "material_id");
      return id !== null && activeById.get(id)?.length === 1;
    });
  const active = [...activeById.values()].flatMap((records) =>
    records.length === 1 ? records : [],
  );
  const rows = active.flatMap((material) => {
    const id = text(material, "material_id");
    const label = text(material, "material_name");
    const minimum = number(material, "ideal_minimum");
    const maximum = number(material, "ideal_maximum");
    if (!id || !label || minimum === null || maximum === null || !asOf) return [];
    const stockRows = inventory.filter(
      (row) => text(row, "material_id") === id && text(row, "snapshot_date") === asOf,
    );
    const stockValues = stockRows.map((row) => number(row, "on_hand_quantity"));
    if (stockRows.length === 0 || !stockValues.every((value): value is number => value !== null))
      return [];
    const onHand = stockValues.reduce((sum, value) => sum + value, 0);
    const openOrders = orders.filter(
      (row) =>
        text(row, "material_id") === id &&
        !["received", "cancelled"].includes(text(row, "status") ?? ""),
    );
    const incomingQuantities = openOrders.map((row) => number(row, "quantity"));
    const incomingComplete =
      incomingQuantities.every((value): value is number => value !== null) &&
      openOrders.every((row) => text(row, "eta") !== null);
    if (!incomingComplete) return [];
    const incoming = incomingQuantities.reduce((sum, value) => sum + value, 0);
    const eta =
      openOrders
        .map((row) => text(row, "eta"))
        .filter((value): value is string => value !== null)
        .sort()[0] ?? null;
    const po =
      openOrders
        .map((row) => text(row, "po_number"))
        .filter((value): value is string => value !== null)
        .sort()[0] ?? null;
    return [{ id, label, onHand, minimum, maximum, incoming, eta, po }];
  });
  const complete = activeRulesComplete && rows.length === active.length;
  const total = rows.reduce((sum, row) => sum + row.onHand, 0);
  const stockMetric = metric(
    context,
    "inventory.packaging_stock",
    complete ? { kind: "quantity", value: total } : null,
    complete ? [] : ["PACKAGING_COVERAGE_INCOMPLETE"],
    "Every active material requires one latest stock row and a complete effective ideal band.",
  );
  const stock = metricBreakdownViewModelSchema.parse({
    metric: stockMetric,
    dimension: "packaging_material_band",
    items: rows.map((row) => ({
      key: row.id,
      label: row.label,
      values: [{ kind: "quantity", value: row.onHand }],
      warnings: [
        `IDEAL_MIN:${row.minimum}`,
        `IDEAL_MAX:${row.maximum}`,
        `INCOMING:${row.incoming}`,
        ...(row.po ? [`PO:${row.po}`] : []),
        ...(row.eta ? [`ETA:${row.eta}`] : []),
      ],
    })),
  });
  const months = asOf ? nextFourCompleteMonths(asOf) : [];
  const projectionRows = months.map((month) => ({ month, values: {} as Record<string, number> }));
  let projectionComplete = complete && months.length === 4;
  for (const row of rows) {
    let ending = row.onHand;
    for (const projection of projectionRows) {
      const matchingForecasts = forecasts.filter(
        (forecast) =>
          text(forecast, "material_id") === row.id &&
          text(forecast, "month")?.slice(0, 7) === projection.month &&
          text(forecast, "status") === "approved",
      );
      if (matchingForecasts.length !== 1) {
        projectionComplete = false;
        continue;
      }
      const consumption = number(matchingForecasts[0] ?? {}, "consumption_quantity");
      if (consumption === null) {
        projectionComplete = false;
        continue;
      }
      const matchingOrders = orders.filter(
        (order) =>
          text(order, "material_id") === row.id &&
          text(order, "eta")?.slice(0, 7) === projection.month &&
          !["received", "cancelled"].includes(text(order, "status") ?? ""),
      );
      const incomingQuantities = matchingOrders.map((order) => number(order, "quantity"));
      if (!incomingQuantities.every((value): value is number => value !== null)) {
        projectionComplete = false;
        continue;
      }
      const incoming = incomingQuantities.reduce((sum, value) => sum + value, 0);
      ending = ending + incoming - consumption;
      projection.values[row.id] = ending;
    }
  }
  const projectionMetric = metric(
    context,
    "inventory.packaging_projection",
    projectionComplete ? { kind: "quantity", value: total } : null,
    projectionComplete ? [] : ["PACKAGING_FORECAST_COVERAGE_INCOMPLETE"],
    "One approved forecast per active material and complete month is required.",
  );
  const projection = metricBreakdownViewModelSchema.parse({
    metric: projectionMetric,
    dimension: "packaging_month_series",
    items: projectionComplete
      ? projectionRows.map((row) => ({
          key: row.month,
          label: row.month,
          values: rows.map(({ id }) => ({
            kind: "quantity" as const,
            value: row.values[id] as number,
          })),
          warnings: rows.map(({ id, label }) => `SERIES:${id}:${label}`),
        }))
      : [],
  });
  const table = metricTableViewModelSchema.parse({
    metric: stockMetric,
    columns: ["material", "onHand", "idealMin", "idealMax", "incoming", "eta"],
    rows: rows.map((row) => ({
      material: row.label,
      onHand: row.onHand,
      idealMin: row.minimum,
      idealMax: row.maximum,
      incoming: row.incoming,
      eta: row.eta,
    })),
  });
  return { stock, projection, table };
}

interface SkuPackMapping {
  readonly sku: string;
  readonly name: string;
  readonly pack: number;
}

const PACK_VARIANT_SKU = /^(.+)-(\d+)PK$/i;

/**
 * Resolves a pack variant that SKU_Master does not map explicitly, e.g. Shopify
 * stocks ZAC-MC-42-10PK while the sheet only maps the 4-pack. The family prefix
 * must resolve to exactly one canonical SKU, and the pack size comes from the
 * variant's own suffix — so the derived mapping can never silently pick the wrong
 * product or the wrong bar count. Explicit mappings are tried first and always win.
 */
function resolvePackVariantSibling(
  shopifySku: string,
  mappings: ReadonlyMap<string, readonly SkuPackMapping[]>,
): readonly SkuPackMapping[] | undefined {
  const match = PACK_VARIANT_SKU.exec(shopifySku);
  const family = match?.[1];
  const pack = Number(match?.[2]);
  if (!family || !Number.isInteger(pack) || pack <= 0) return undefined;
  const siblings = new Map<string, SkuPackMapping>();
  for (const [candidate, candidateMappings] of mappings) {
    if (PACK_VARIANT_SKU.exec(candidate)?.[1]?.toLowerCase() !== family.toLowerCase()) continue;
    for (const mapping of candidateMappings) siblings.set(mapping.sku, mapping);
  }
  if (siblings.size !== 1) return undefined;
  const sibling = [...siblings.values()][0];
  return sibling ? [{ sku: sibling.sku, name: sibling.name, pack }] : undefined;
}

export function buildOperationalInventoryViews(
  context: MetricServiceContext,
  shopifyInventory: readonly InventoryFact[],
  skuMaster: readonly SheetRecord[],
  locationMaster: readonly SheetRecord[],
  snapshots: readonly SheetRecord[],
  targets: readonly SheetRecord[],
): {
  readonly shopify: MetricBreakdownViewModel;
  readonly combined: MetricBreakdownViewModel;
  readonly stockBand: MetricBreakdownViewModel;
  readonly stockHealth: MetricViewModel;
} {
  const activeSkus = skuMaster.filter((row) => text(row, "is_active") !== "no");
  const mappings = new Map<
    string,
    Array<{ readonly sku: string; readonly name: string; readonly pack: number }>
  >();
  for (const row of activeSkus) {
    const shopifySku = text(row, "shopify_variant_sku");
    const sku = text(row, "sku_id");
    const name = text(row, "canonical_name") ?? sku;
    const pack = number(row, "pack_size_bars");
    if (!shopifySku || !sku || !name || pack === null || pack <= 0) continue;
    mappings.set(shopifySku, [...(mappings.get(shopifySku) ?? []), { sku, name, pack }]);
  }
  const activeLocations = locationMaster.filter((row) => text(row, "is_active") !== "no");
  const shopifyLocationNames = new Set(shopifyInventory.map(({ locationName }) => locationName));
  const shopifyLocationMappings = new Map<string, string[]>();
  // Locations joined to Shopify by name alone, because the sheet has no explicit
  // provider column. Tracked so their snapshot rows are not also counted as
  // external stock, which would double the same physical units.
  const fallbackMappedLocations = new Set<string>();
  for (const row of activeLocations) {
    const providerName = text(row, "shopify_location_name");
    const location = text(row, "location_name");
    if (!location) continue;
    if (providerName) {
      shopifyLocationMappings.set(providerName, [
        ...(shopifyLocationMappings.get(providerName) ?? []),
        location,
      ]);
      continue;
    }
    // The new workbook dropped shopify_location_name. Fall back to the plain
    // location name, but only where Shopify actually reports one by that name —
    // otherwise a purely manual location like YBYD looks like a broken join.
    if (shopifyLocationNames.has(location)) {
      shopifyLocationMappings.set(location, [
        ...(shopifyLocationMappings.get(location) ?? []),
        location,
      ]);
      fallbackMappedLocations.add(location);
    }
  }
  const warnings: string[] = [];
  const shopifyBySku = new Map<string, { name: string; quantity: number }>();
  const shopifyByWarehouseSku = new Map<
    string,
    { warehouse: string; sku: string; name: string; quantity: number }
  >();
  for (const fact of shopifyInventory.filter(({ quantityName }) => quantityName === "on_hand")) {
    if (fact.quantity <= 0) continue;
    const skuMappings = fact.sku
      ? (mappings.get(fact.sku) ?? resolvePackVariantSibling(fact.sku, mappings))
      : undefined;
    const locations = shopifyLocationMappings.get(fact.locationName);
    if (!skuMappings || skuMappings.length !== 1) {
      warnings.push(`UNMAPPED_SHOPIFY_SKU:${fact.sku ?? "blank"}`);
      continue;
    }
    if (!locations || locations.length !== 1) {
      warnings.push(`UNMAPPED_SHOPIFY_LOCATION:${fact.locationName}`);
      continue;
    }
    const mapping = skuMappings[0];
    const warehouse = locations[0];
    if (!mapping || !warehouse) continue;
    const bars = fact.quantity * mapping.pack;
    const skuPrior = shopifyBySku.get(mapping.sku);
    shopifyBySku.set(mapping.sku, {
      name: mapping.name,
      quantity: (skuPrior?.quantity ?? 0) + bars,
    });
    const key = `${warehouse}:${mapping.sku}`;
    const locationPrior = shopifyByWarehouseSku.get(key);
    shopifyByWarehouseSku.set(key, {
      warehouse,
      sku: mapping.sku,
      name: mapping.name,
      quantity: (locationPrior?.quantity ?? 0) + bars,
    });
  }
  const mappedProviderLocations = new Set(
    shopifyInventory
      .filter(({ quantityName }) => quantityName === "on_hand")
      .map(({ locationName }) => locationName),
  );
  for (const providerName of shopifyLocationMappings.keys()) {
    if (!mappedProviderLocations.has(providerName))
      warnings.push(`SHOPIFY_LOCATION_MISSING:${providerName}`);
  }
  const shopifyComplete = warnings.length === 0 && shopifyBySku.size > 0;
  const shopifyTotal = [...shopifyBySku.values()].reduce((sum, row) => sum + row.quantity, 0);
  const shopifyMetric = metric(
    context,
    "inventory.shopify_current",
    shopifyComplete ? { kind: "count", value: shopifyTotal } : null,
    warnings,
    "Every positive Shopify on-hand row requires one active SKU and location mapping.",
  );
  const shopify = metricBreakdownViewModelSchema.parse({
    metric: shopifyMetric,
    dimension: "canonical_sku_bars",
    items: [...shopifyBySku].map(([key, row]) => ({
      key,
      label: row.name,
      values: [{ kind: "quantity", value: row.quantity }],
      warnings,
    })),
  });

  const nonShopifyLocations = activeLocations
    .filter((row) => !text(row, "shopify_location_name"))
    .map((row) => text(row, "location_name"))
    .filter((value): value is string => value !== null)
    .filter((location) => !fallbackMappedLocations.has(location));
  // Anchor the latest snapshot on external locations only. Connector-fed SNAPL
  // rows arrive daily and would otherwise make every weekly manual count look
  // stale, permanently emptying the external side of the total.
  const nonShopifySnapshots = snapshots.filter((row) =>
    nonShopifyLocations.includes(text(row, "warehouse") ?? ""),
  );
  const snapshotDate =
    nonShopifySnapshots
      .map((row) => text(row, "snapshot_at")?.slice(0, 10) ?? null)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? null;
  const nonShopifyRows = snapshotDate
    ? nonShopifySnapshots.filter((row) => text(row, "snapshot_at")?.slice(0, 10) === snapshotDate)
    : [];
  const activeSkuIds = new Set(
    activeSkus.map((row) => text(row, "sku_id")).filter((value): value is string => value !== null),
  );
  const snapshotKeys = nonShopifyRows.map(
    (row) => `${text(row, "warehouse") ?? ""}:${text(row, "sku") ?? ""}`,
  );
  const presentNonShopify = new Set(nonShopifyRows.map((row) => text(row, "warehouse")));
  // Only locations that have ever been counted are required at the latest date.
  // A location seeded in Location_Master but never snapshotted is not missing
  // data, and with no external history at all the Shopify figure stands alone.
  const locationsWithHistory = new Set(
    nonShopifySnapshots
      .map((row) => text(row, "warehouse"))
      .filter((value): value is string => value !== null),
  );
  const snapshotComplete =
    nonShopifyLocations
      .filter((location) => locationsWithHistory.has(location))
      .every((location) => presentNonShopify.has(location)) &&
    new Set(snapshotKeys).size === snapshotKeys.length &&
    nonShopifyRows.every((row) => {
      const sku = text(row, "sku");
      return sku !== null && activeSkuIds.has(sku) && number(row, "on_hand") !== null;
    });
  const combinedRows = [
    ...shopifyByWarehouseSku.values(),
    ...nonShopifyRows.flatMap((row) => {
      const warehouse = text(row, "warehouse");
      const sku = text(row, "sku");
      const quantity = number(row, "on_hand");
      const name = activeSkus.find((candidate) => text(candidate, "sku_id") === sku);
      return warehouse && sku && quantity !== null
        ? [{ warehouse, sku, name: text(name ?? {}, "canonical_name") ?? sku, quantity }]
        : [];
    }),
  ];
  const combinedComplete = shopifyComplete && snapshotComplete;
  const combinedTotal = combinedRows.reduce((sum, row) => sum + row.quantity, 0);
  const combinedMetric = metric(
    context,
    "inventory.combined",
    combinedComplete ? { kind: "quantity", value: combinedTotal } : null,
    combinedComplete ? [] : [...warnings, "INVENTORY_SOURCE_AUTHORITY_COVERAGE_INCOMPLETE"],
    "Mapped Shopify locations and one consistent latest non-Shopify snapshot are required.",
  );
  const combined = metricBreakdownViewModelSchema.parse({
    metric: combinedMetric,
    dimension: "warehouse",
    items: [...new Set(combinedRows.map(({ warehouse }) => warehouse))].map((warehouse) => ({
      key: warehouse,
      label: warehouse,
      values: [
        {
          kind: "quantity",
          value: combinedRows
            .filter((row) => row.warehouse === warehouse)
            .reduce((sum, row) => sum + row.quantity, 0),
        },
      ],
      warnings: combinedComplete ? [] : ["INVENTORY_SOURCE_AUTHORITY_COVERAGE_INCOMPLETE"],
    })),
  });

  const quantityBySku = new Map<string, number>();
  for (const row of combinedRows)
    quantityBySku.set(row.sku, (quantityBySku.get(row.sku) ?? 0) + row.quantity);
  const applicableTarget = (sku: string, key: string) =>
    targets.filter(
      (row) =>
        text(row, "metric_key") === key &&
        text(row, "scope_type") === "sku" &&
        text(row, "scope_value") === sku &&
        text(row, "status") === "active" &&
        (text(row, "period_start") ?? "9999-12-31") <= context.dataPeriod.endDate &&
        (text(row, "period_end") ?? "0000-00-00") >= context.dataPeriod.endDate,
    );
  const bandRows = activeSkus
    .flatMap((row) => {
      const sku = text(row, "sku_id");
      const name = text(row, "canonical_name") ?? sku;
      if (!sku || !name) return [];
      const minimum = applicableTarget(sku, "inventory.stock_min");
      const maximum = applicableTarget(sku, "inventory.stock_max");
      const onHand = quantityBySku.get(sku);
      return minimum.length === 1 && maximum.length === 1 && onHand !== undefined
        ? [
            {
              sku,
              name,
              onHand,
              minimum: number(minimum[0] ?? {}, "target_value"),
              maximum: number(maximum[0] ?? {}, "target_value"),
            },
          ]
        : [];
    })
    .filter(
      (
        row,
      ): row is { sku: string; name: string; onHand: number; minimum: number; maximum: number } =>
        row.minimum !== null && row.maximum !== null,
    );
  const bandComplete =
    combinedComplete && activeSkus.length > 0 && bandRows.length === activeSkus.length;
  const inBand = bandRows.filter(
    (row) => row.onHand >= row.minimum && row.onHand <= row.maximum,
  ).length;
  const stockMetric = metric(
    context,
    "inventory.sku_stock",
    bandComplete ? { kind: "quantity", value: combinedTotal } : null,
    bandComplete ? [] : ["SKU_STOCK_BAND_COVERAGE_INCOMPLETE"],
    "Every active SKU requires current stock and one effective approved minimum and maximum.",
  );
  const stockBand = metricBreakdownViewModelSchema.parse({
    metric: stockMetric,
    dimension: "sku_stock_band",
    items: bandRows.map((row) => ({
      key: row.sku,
      label: row.name,
      values: [{ kind: "quantity", value: row.onHand }],
      warnings: [`IDEAL_MIN:${row.minimum}`, `IDEAL_MAX:${row.maximum}`],
    })),
  });
  const stockHealth = metric(
    context,
    "inventory.stock_health",
    bandComplete ? { kind: "status", value: `${inBand} of ${activeSkus.length} in band` } : null,
    bandComplete ? [] : ["SKU_STOCK_BAND_COVERAGE_INCOMPLETE"],
    "Complete effective bands and current stock are required for every active SKU.",
  );
  return { shopify, combined, stockBand, stockHealth };
}

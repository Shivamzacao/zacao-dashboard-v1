import type {
  CanonicalFulfillment,
  CanonicalInventoryPosition,
  CanonicalLocation,
  CanonicalVariant,
} from "@/src/domain/commerce/models";

import type { SheetRecord } from "../ports/sheets-tabs";
import { reconcile, type ReconciliationReport } from "./reconcile";

/**
 * Comparers for the spreadsheet tabs Shopify can replace. Each joins only on a
 * mapping the workbook itself declares (e.g. SKU_Master.shopify_variant_sku);
 * rows that cannot be joined are reported, never matched by guesswork.
 */

const text = (row: SheetRecord, column: string): string | null => {
  const value = row[column];
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
};

const number = (row: SheetRecord, column: string): number | null => {
  const value = row[column];
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const yes = (row: SheetRecord, column: string): boolean | null => {
  const value = text(row, column)?.toLowerCase();
  return value === "yes" ? true : value === "no" ? false : null;
};

const upper = (value: string | null): string | null => value?.toUpperCase() ?? null;
const folded = (value: string | null): string | null => value?.toLowerCase() ?? null;

/** America/New_York calendar date of an instant — the dashboard's reporting day. */
export function reportingDate(instant: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

/** SKU_Master identity vs Shopify variants, joined on shopify_variant_sku. */
export function compareSkuIdentity(
  skuMaster: readonly SheetRecord[],
  variants: readonly CanonicalVariant[],
): ReconciliationReport {
  return reconcile({
    dataset: "SKU_Master (identity columns)",
    oldSource: "google_sheets:SKU_Master",
    newSource: "shopify:productVariants",
    oldRows: skuMaster.filter((row) => text(row, "shopify_variant_sku") !== null),
    newRows: variants.filter((variant) => variant.sku !== null),
    oldKey: (row) => upper(text(row, "shopify_variant_sku")),
    newKey: (variant) => upper(variant.sku),
    fields: [
      {
        name: "product_title",
        old: (row) => text(row, "shopify_product_title"),
        new: (variant) => variant.productTitle,
      },
      {
        name: "variant_title",
        old: (row) => text(row, "shopify_variant_title"),
        new: (variant) => variant.variantTitle,
      },
      {
        name: "is_active",
        old: (row) => yes(row, "is_active"),
        new: (variant) => variant.productStatus === "ACTIVE",
      },
    ],
    notes: [
      "Rows without shopify_variant_sku are excluded: they declare no Shopify mapping.",
      "pack_size_bars has no Shopify equivalent and is not compared; it stays configuration.",
    ],
  });
}

/**
 * Location_Master vs Shopify locations. The declared provider name
 * (shopify_location_name) is used when present; the new workbook dropped that
 * column, so location_name is the fallback, compared case-insensitively.
 */
export function compareLocations(
  locationMaster: readonly SheetRecord[],
  locations: readonly CanonicalLocation[],
): ReconciliationReport {
  return reconcile({
    dataset: "Location_Master",
    oldSource: "google_sheets:Location_Master",
    newSource: "shopify:locations",
    oldRows: locationMaster,
    newRows: locations,
    oldKey: (row) => folded(text(row, "shopify_location_name") ?? text(row, "location_name")),
    newKey: (location) => folded(location.name),
    fields: [
      {
        name: "is_active",
        old: (row) => yes(row, "is_active"),
        new: (location) => location.isActive,
      },
    ],
    notes: [
      "Shopify location names are not unique (this store has two named SNAPL, one inactive); duplicate keys are reported, not merged. Join by Location.id once the workbook records it.",
      "Manual-only locations (e.g. YBYD) legitimately appear only in the sheet.",
    ],
  });
}

interface InventoryRow {
  readonly warehouse: string;
  readonly sku: string;
  readonly bars: number;
}

/**
 * The Shopify-mirrored part of Inventory_Snapshots vs Shopify on-hand. Only
 * warehouses Location_Master maps to a Shopify location are compared, at the
 * latest snapshot date among them; values are bars (on_hand × pack_size_bars),
 * the same basis operations.ts uses to combine both sources.
 */
export function compareShopifyMirroredInventory(input: {
  readonly snapshots: readonly SheetRecord[];
  readonly skuMaster: readonly SheetRecord[];
  readonly locationMaster: readonly SheetRecord[];
  readonly positions: readonly CanonicalInventoryPosition[];
}): ReconciliationReport {
  const skuBySheetSku = new Map<string, { sku: string; pack: number }>();
  for (const row of input.skuMaster) {
    const shopifySku = upper(text(row, "shopify_variant_sku"));
    const sku = text(row, "sku_id");
    const pack = number(row, "pack_size_bars");
    if (shopifySku && sku && pack !== null && pack > 0)
      skuBySheetSku.set(shopifySku, { sku, pack });
  }
  const shopifyNames = new Set(input.positions.map(({ locationName }) => folded(locationName)));
  const warehouseByProvider = new Map<string, string>();
  for (const row of input.locationMaster) {
    if (yes(row, "is_active") === false) continue;
    const warehouse = text(row, "location_name");
    const provider = folded(text(row, "shopify_location_name") ?? text(row, "location_name"));
    if (warehouse && provider && shopifyNames.has(provider))
      warehouseByProvider.set(provider, warehouse);
  }
  const mappedWarehouses = new Set(warehouseByProvider.values());

  const mirrored = input.snapshots.filter((row) =>
    mappedWarehouses.has(text(row, "warehouse") ?? ""),
  );
  const latest =
    mirrored
      .map((row) => text(row, "snapshot_at")?.slice(0, 10) ?? null)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? null;
  const oldRows: InventoryRow[] = mirrored
    .filter((row) => latest !== null && text(row, "snapshot_at")?.slice(0, 10) === latest)
    .flatMap((row) => {
      const warehouse = text(row, "warehouse");
      const sku = text(row, "sku");
      const bars = number(row, "on_hand");
      return warehouse && sku && bars !== null ? [{ warehouse, sku, bars }] : [];
    });

  const unmappedSkus = new Set<string>();
  const byKey = new Map<string, InventoryRow>();
  for (const position of input.positions) {
    const onHand = position.quantities["on_hand"];
    const warehouse = warehouseByProvider.get(folded(position.locationName) ?? "");
    if (onHand === undefined || !warehouse) continue;
    const mapping = position.sku ? skuBySheetSku.get(position.sku.toUpperCase()) : undefined;
    if (!mapping) {
      if (onHand !== 0) unmappedSkus.add(position.sku ?? "blank");
      continue;
    }
    const key = `${warehouse}:${mapping.sku}`;
    const prior = byKey.get(key);
    byKey.set(key, {
      warehouse,
      sku: mapping.sku,
      bars: (prior?.bars ?? 0) + onHand * mapping.pack,
    });
  }

  return reconcile({
    dataset: "Inventory_Snapshots (Shopify-mapped warehouses)",
    oldSource: `google_sheets:Inventory_Snapshots@${latest ?? "none"}`,
    newSource: "shopify:inventoryLevels(on_hand)",
    oldRows,
    newRows: [...byKey.values()],
    oldKey: (row) => `${row.warehouse}:${row.sku}`,
    newKey: (row) => `${row.warehouse}:${row.sku}`,
    fields: [{ name: "on_hand_bars", old: (row) => row.bars, new: (row) => row.bars, total: true }],
    notes: [
      `Sheet snapshot date ${latest ?? "(none)"} vs Shopify levels read now: stock moves between the two instants, so small deltas can be timing, not error.`,
      ...(unmappedSkus.size > 0
        ? [
            `Shopify SKUs with stock but no SKU_Master mapping: ${[...unmappedSkus].sort().join(", ")}`,
          ]
        : []),
    ],
  });
}

const orderKey = (value: string | null): string | null =>
  value ? value.replace(/^#/, "").trim().toUpperCase() : null;

/**
 * Warehouse_Fulfillment ship dates vs Shopify fulfillments, joined on the
 * merchant order name. pick_accurate has no Shopify equivalent and stays a
 * manual/3PL field. Dates compare on the America/New_York calendar day.
 */
export function compareFulfillmentTiming(
  warehouseFulfillment: readonly SheetRecord[],
  fulfillments: readonly CanonicalFulfillment[],
): ReconciliationReport {
  const firstByOrder = new Map<string, CanonicalFulfillment>();
  for (const fulfillment of fulfillments) {
    const key = orderKey(fulfillment.orderName);
    if (!key) continue;
    const prior = firstByOrder.get(key);
    if (!prior || fulfillment.createdAt < prior.createdAt) firstByOrder.set(key, fulfillment);
  }
  return reconcile({
    dataset: "Warehouse_Fulfillment (ship timing)",
    oldSource: "google_sheets:Warehouse_Fulfillment",
    newSource: "shopify:Order.fulfillments",
    oldRows: warehouseFulfillment,
    newRows: [...firstByOrder.values()],
    oldKey: (row) => orderKey(text(row, "order_id")),
    newKey: (fulfillment) => orderKey(fulfillment.orderName),
    fields: [
      {
        name: "shipped_date",
        old: (row) => {
          const shipped = text(row, "shipped_at");
          return shipped ? shipped.slice(0, 10) : null;
        },
        new: (fulfillment) => reportingDate(fulfillment.createdAt),
      },
    ],
    notes: [
      "Shopify side is the first fulfillment's createdAt per order; the sheet's shipped_at definition is not documented in the repo.",
      "pick_accurate and promised_ship_at are not compared: Shopify has no pick-accuracy field, and fulfillBy is not the 3PL SLA.",
    ],
  });
}

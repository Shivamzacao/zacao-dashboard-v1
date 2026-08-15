import type {
  CashPositionFact,
  CombinedInventoryFact,
  InventoryLotFact,
  ProductionIncomingFact,
} from "@/src/application/metrics/types";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";
import { usdFromDecimalNumber } from "@/src/domain/metrics/calculations";

function text(record: SheetRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function numeric(record: SheetRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const PRODUCTION_ORDER_INCOMING_STATUSES = [
  "open",
  "confirmed",
  "in_production",
  "in_transit",
  "partially_received",
] as const;

/** Statuses that leave units still incoming per ADR-003. */
const incomingStatuses = new Set<string>(PRODUCTION_ORDER_INCOMING_STATUSES);

export interface CombinedInventoryMapping {
  readonly facts: readonly CombinedInventoryFact[];
  readonly completeRequiredLocations: boolean;
}

/**
 * Location_Master is the roster of countable warehouses. Older workbooks predate
 * a populated master, so the ADR-003 pair stays as a floor — plus "SNAPL", the
 * new workbook's name for the 3PL the legacy one calls "SNAPL 3PL".
 */
const FALLBACK_COUNTABLE_WAREHOUSES = new Set(["SNAPL 3PL", "SNAPL", "YBYD"]);

/**
 * Latest valid snapshot **per location**, never one global MAX across locations
 * (spec §5.3): connector-fed locations are written daily while the team counts
 * external stock weekly, so a shared cut-off would permanently strand whichever
 * side updates less often. Coverage is complete when every countable location
 * that has ever reported contributes its own most recent reading.
 */
export function toCombinedInventoryFacts(
  snapshots: readonly SheetRecord[],
  locationMaster: readonly SheetRecord[],
): CombinedInventoryMapping {
  const activeLocations = new Set(
    locationMaster.flatMap((record) => {
      const name = text(record, "location_name");
      const active = text(record, "is_active");
      return name && active === "yes" ? [name] : [];
    }),
  );
  const countable = (warehouse: string) =>
    activeLocations.size > 0
      ? activeLocations.has(warehouse)
      : FALLBACK_COUNTABLE_WAREHOUSES.has(warehouse);

  const byBusinessKey = new Map<string, CombinedInventoryFact[]>();
  for (const record of snapshots) {
    const snapshotAt = text(record, "snapshot_at");
    const warehouse = text(record, "warehouse");
    const sku = text(record, "sku");
    const onHand = numeric(record, "on_hand");
    if (!snapshotAt || !warehouse || !sku || onHand === null || !countable(warehouse)) {
      continue;
    }
    const key = `${snapshotAt}:${warehouse}:${sku}`;
    const fact = { asOfDate: snapshotAt.slice(0, 10), warehouse, sku, quantity: onHand };
    byBusinessKey.set(key, [...(byBusinessKey.get(key) ?? []), fact]);
  }
  const dated = [...byBusinessKey.values()].flatMap((duplicates) => {
    const quantities = new Set(duplicates.map(({ quantity }) => quantity));
    const first = duplicates[0];
    return quantities.size === 1 && first ? [first] : [];
  });
  const latestByWarehouse = new Map<string, string>();
  for (const { warehouse, asOfDate } of dated) {
    const previous = latestByWarehouse.get(warehouse);
    if (previous === undefined || asOfDate > previous) latestByWarehouse.set(warehouse, asOfDate);
  }
  const facts = dated.filter(
    ({ warehouse, asOfDate }) => latestByWarehouse.get(warehouse) === asOfDate,
  );

  const presentWarehouses = new Set(facts.map(({ warehouse }) => warehouse));
  const completeRequiredLocations =
    facts.length > 0 &&
    [...latestByWarehouse.keys()].every((warehouse) => presentWarehouses.has(warehouse));
  return { facts, completeRequiredLocations };
}

export function toInventoryLotFacts(
  records: readonly SheetRecord[],
  fallbackAsOfDate: string,
): readonly InventoryLotFact[] {
  return records.flatMap((record) => {
    const warehouse = text(record, "warehouse");
    const sku = text(record, "sku");
    const lotCode = text(record, "lot_number");
    const bestByDate = text(record, "best_by_date");
    const quantityRemaining = numeric(record, "quantity_remaining");
    if (!warehouse || !sku || !lotCode || quantityRemaining === null) return [];
    return [
      {
        asOfDate: text(record, "data_as_of") ?? fallbackAsOfDate,
        warehouse,
        sku,
        lotCode,
        bestByDate,
        quantityRemaining,
        status: text(record, "status"),
      },
    ];
  });
}

export interface ProductionIncomingMapping {
  readonly facts: readonly ProductionIncomingFact[];
  readonly excludedWithoutExpectedDate: number;
}

export function toProductionIncomingFacts(
  records: readonly SheetRecord[],
): ProductionIncomingMapping {
  let excludedWithoutExpectedDate = 0;
  const facts = records.flatMap((record) => {
    const status = text(record, "status");
    if (!status || !incomingStatuses.has(status)) return [];
    const poNumber = text(record, "po_number");
    const sku = text(record, "sku");
    const units = numeric(record, "units");
    if (!poNumber || !sku || units === null) return [];
    const expectedArrivalDate = text(record, "expected_date") ?? text(record, "must_deliver_by");
    if (!expectedArrivalDate) excludedWithoutExpectedDate += 1;
    const unitCost = numeric(record, "unit_cost_usd");
    const freight = numeric(record, "freight_usd");
    return [
      {
        poNumber,
        poLine: text(record, "record_id") ?? poNumber,
        sku,
        destinationWarehouse: text(record, "destination_warehouse") ?? "Unassigned",
        status,
        expectedArrivalDate,
        incomingUnits: units,
        incomingValueMinorUnits:
          unitCost === null ? null : usdFromDecimalNumber(units * unitCost).minorUnits,
        freightMinorUnits: freight === null ? null : usdFromDecimalNumber(freight).minorUnits,
        unitsReceived: numeric(record, "received_units"),
      },
    ];
  });
  return { facts, excludedWithoutExpectedDate };
}

export interface CashPositionMapping {
  readonly facts: readonly CashPositionFact[];
  readonly completeAccountCoverage: boolean;
}

/** Single company-wide balance model: account is constant (ADR-003). */
export function toCashPositionFacts(records: readonly SheetRecord[]): CashPositionMapping {
  const facts = records.flatMap((record) => {
    const date = text(record, "as_of_date");
    const balance = numeric(record, "cash_balance_usd");
    if (!date || balance === null) return [];
    const restricted = numeric(record, "restricted_cash_usd");
    return [
      {
        date,
        account: "all_accounts",
        balanceMinorUnits: usdFromDecimalNumber(balance).minorUnits,
        restrictedCashMinorUnits:
          restricted === null ? null : usdFromDecimalNumber(restricted).minorUnits,
      },
    ];
  });
  return { facts, completeAccountCoverage: facts.length > 0 };
}

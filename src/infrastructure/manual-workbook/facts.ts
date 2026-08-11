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
 * Latest snapshot date only; coverage is complete when every required active
 * warehouse (from Location_Master) appears at that date (ADR-003).
 */
export function toCombinedInventoryFacts(
  snapshots: readonly SheetRecord[],
  locationMaster: readonly SheetRecord[],
): CombinedInventoryMapping {
  const requiredNames = new Set(["SNAPL 3PL", "YBYD"]);
  const byBusinessKey = new Map<string, CombinedInventoryFact[]>();
  for (const record of snapshots) {
    const snapshotAt = text(record, "snapshot_at");
    const warehouse = text(record, "warehouse");
    const sku = text(record, "sku");
    const onHand = numeric(record, "on_hand");
    if (!snapshotAt || !warehouse || !sku || onHand === null || !requiredNames.has(warehouse)) {
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
  const latestDate = dated
    .map(({ asOfDate }) => asOfDate)
    .sort()
    .at(-1);
  const facts = latestDate ? dated.filter(({ asOfDate }) => asOfDate === latestDate) : [];

  const activeLocations = new Set(
    locationMaster.flatMap((record) => {
      const name = text(record, "location_name");
      const active = text(record, "is_active");
      return name && active === "yes" ? [name] : [];
    }),
  );
  const requiredWarehouses = [...requiredNames].filter((name) => activeLocations.has(name));
  const presentWarehouses = new Set(facts.map(({ warehouse }) => warehouse));
  const completeRequiredLocations =
    facts.length > 0 &&
    requiredWarehouses.length > 0 &&
    requiredWarehouses.every((warehouse) => presentWarehouses.has(warehouse));
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
        // The workbook does not capture a destination warehouse (ADR-003).
        destinationWarehouse: "Unassigned",
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

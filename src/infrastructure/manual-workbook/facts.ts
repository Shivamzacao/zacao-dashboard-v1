import type {
  CashPositionFact,
  CombinedInventoryFact,
  InventoryLotFact,
  ProductionIncomingFact,
} from "@/src/application/metrics/types";
import type { ManualStoreRecord } from "@/src/application/ports/manual-workbook";
import { usdFromDecimalNumber } from "@/src/domain/metrics/calculations";

function text(record: ManualStoreRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function numeric(record: ManualStoreRecord, key: string): number | null {
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
  snapshots: readonly ManualStoreRecord[],
  locationMaster: readonly ManualStoreRecord[],
): CombinedInventoryMapping {
  const dated = snapshots.flatMap((record) => {
    const snapshotAt = text(record, "snapshot_at");
    const warehouse = text(record, "warehouse");
    const sku = text(record, "sku");
    const onHand = numeric(record, "on_hand");
    if (!snapshotAt || !warehouse || !sku || onHand === null) return [];
    return [{ asOfDate: snapshotAt.slice(0, 10), warehouse, sku, quantity: onHand }];
  });
  const latestDate = dated
    .map(({ asOfDate }) => asOfDate)
    .sort()
    .at(-1);
  const facts = latestDate ? dated.filter(({ asOfDate }) => asOfDate === latestDate) : [];

  const requiredWarehouses = locationMaster.flatMap((record) => {
    const name = text(record, "location_name");
    const active = text(record, "is_active");
    return name && active === "yes" ? [name] : [];
  });
  const presentWarehouses = new Set(facts.map(({ warehouse }) => warehouse));
  const completeRequiredLocations =
    facts.length > 0 &&
    requiredWarehouses.length > 0 &&
    requiredWarehouses.every((warehouse) => presentWarehouses.has(warehouse));
  return { facts, completeRequiredLocations };
}

export function toInventoryLotFacts(
  records: readonly ManualStoreRecord[],
  fallbackAsOfDate: string,
): readonly InventoryLotFact[] {
  return records.flatMap((record) => {
    const warehouse = text(record, "warehouse");
    const sku = text(record, "sku");
    const lotCode = text(record, "lot_number");
    const bestByDate = text(record, "best_by_date");
    const quantityRemaining = numeric(record, "quantity_remaining");
    if (!warehouse || !sku || !lotCode || !bestByDate || quantityRemaining === null) return [];
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
  records: readonly ManualStoreRecord[],
): ProductionIncomingMapping {
  let excludedWithoutExpectedDate = 0;
  const facts = records.flatMap((record) => {
    const status = text(record, "status");
    if (!status || !incomingStatuses.has(status)) return [];
    const poNumber = text(record, "po_number");
    const sku = text(record, "sku");
    const units = numeric(record, "units");
    if (!poNumber || !sku || units === null) return [];
    const expectedArrivalDate = text(record, "expected_date");
    if (!expectedArrivalDate) {
      // ADR-003: rows without an expected date cannot appear on the incoming
      // timeline; they are counted and disclosed instead of guessed.
      excludedWithoutExpectedDate += 1;
      return [];
    }
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
        // The workbook records no received-unit quantity; unknown stays null.
        unitsReceived: null,
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
export function toCashPositionFacts(records: readonly ManualStoreRecord[]): CashPositionMapping {
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

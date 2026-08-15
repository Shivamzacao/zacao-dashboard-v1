import { describe, expect, it } from "vitest";

import { toCombinedInventoryFacts } from "@/src/infrastructure/manual-workbook/facts";

const location = (name: string) => ({ location_name: name, is_active: "yes" });

const snapshot = (asOf: string, warehouse: string, sku: string, onHand: number) => ({
  snapshot_at: asOf,
  warehouse,
  sku,
  on_hand: onHand,
});

describe("combined inventory facts", () => {
  it("takes the latest snapshot per location rather than one global cut-off", () => {
    // The connector writes SNAPL daily; the team counts external stock weekly. A
    // shared MAX(snapshot_date) would strand whichever side updates less often —
    // spec §5.3 forbids exactly that.
    const { facts, completeRequiredLocations } = toCombinedInventoryFacts(
      [
        snapshot("2026-08-13", "SNAPL", "SKU-01", 8),
        snapshot("2026-08-15", "YBYD", "SKU-01", 240),
        snapshot("2026-08-15", "Amazon FBA", "SKU-01", 120),
      ],
      [location("SNAPL"), location("YBYD"), location("Amazon FBA")],
    );

    expect(facts.map(({ warehouse, quantity }) => [warehouse, quantity])).toEqual([
      ["SNAPL", 8],
      ["YBYD", 240],
      ["Amazon FBA", 120],
    ]);
    expect(completeRequiredLocations).toBe(true);
  });

  it("counts every active Location_Master warehouse, not a hardcoded pair", () => {
    // Amazon FBA holds real stock; dropping it would silently understate the total.
    const { facts } = toCombinedInventoryFacts(
      [snapshot("2026-08-15", "Amazon FBA", "SKU-02", 90)],
      [location("SNAPL"), location("YBYD"), location("Amazon FBA")],
    );
    expect(facts).toEqual([
      { asOfDate: "2026-08-15", warehouse: "Amazon FBA", sku: "SKU-02", quantity: 90 },
    ]);
  });

  it("keeps only the newest reading when a location reports twice", () => {
    const { facts } = toCombinedInventoryFacts(
      [
        snapshot("2026-08-08", "YBYD", "SKU-01", 300),
        snapshot("2026-08-15", "YBYD", "SKU-01", 240),
      ],
      [location("YBYD")],
    );
    expect(facts).toEqual([
      { asOfDate: "2026-08-15", warehouse: "YBYD", sku: "SKU-01", quantity: 240 },
    ]);
  });

  it("drops a location whose same-date rows disagree instead of picking one", () => {
    const { facts } = toCombinedInventoryFacts(
      [
        snapshot("2026-08-15", "YBYD", "SKU-01", 240),
        snapshot("2026-08-15", "YBYD", "SKU-01", 999),
      ],
      [location("YBYD")],
    );
    expect(facts).toEqual([]);
  });

  it("ignores warehouses that are not active locations", () => {
    const { facts } = toCombinedInventoryFacts(
      [snapshot("2026-08-15", "Retired Depot", "SKU-01", 50)],
      [location("YBYD"), { location_name: "Retired Depot", is_active: "no" }],
    );
    expect(facts).toEqual([]);
  });

  it("falls back to the ADR-003 warehouses when Location_Master is empty", () => {
    const { facts } = toCombinedInventoryFacts(
      [
        snapshot("2026-08-15", "SNAPL 3PL", "SKU-01", 40),
        snapshot("2026-08-15", "Unlisted", "SKU-01", 10),
      ],
      [],
    );
    expect(facts.map(({ warehouse }) => warehouse)).toEqual(["SNAPL 3PL"]);
  });
});

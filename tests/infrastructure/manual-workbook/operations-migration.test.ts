import { describe, expect, it } from "vitest";

import { MANUAL_TAB_CONTRACTS } from "@/src/infrastructure/manual-workbook/contracts.generated";
import {
  OPERATIONS_PRODUCTION_ORDER_HEADERS,
  OPERATIONS_PRODUCTION_WORKBOOK_ID,
  OPERATIONS_SCHEMA_TABS,
  planOperationsWorkbookMigration,
} from "@/src/infrastructure/manual-workbook/operations-migration";

const baseProductionHeaders = MANUAL_TAB_CONTRACTS.Production_Orders.columns
  .map(({ header }) => header)
  .filter((header) => !OPERATIONS_PRODUCTION_ORDER_HEADERS.includes(header as never));

const snapshot = (overrides: Readonly<Record<string, readonly string[]>> = {}) => ({
  workbookId: OPERATIONS_PRODUCTION_WORKBOOK_ID,
  tabs: { Production_Orders: baseProductionHeaders, ...overrides },
});

describe("Operations workbook migration planner", () => {
  it("produces a backed-up dry run with only additive schema changes", () => {
    const plan = planOperationsWorkbookMigration(snapshot());
    expect(plan.mode).toBe("dry-run");
    expect(plan.requiresBackup).toBe(true);
    expect(plan.productionOrderHeadersToAppend).toEqual(OPERATIONS_PRODUCTION_ORDER_HEADERS);
    expect(plan.tabsToAdd.map(({ name }) => name)).toEqual(OPERATIONS_SCHEMA_TABS);
  });

  it("requires a dedicated write opt-in for apply mode", () => {
    expect(() => planOperationsWorkbookMigration(snapshot(), { mode: "apply" })).toThrow(
      /dedicated opt-in/,
    );
    expect(
      planOperationsWorkbookMigration(snapshot(), { mode: "apply", writeOptIn: true }).mode,
    ).toBe("apply");
  });

  it("aborts on a non-allowlisted workbook or conflicting schema", () => {
    expect(() =>
      planOperationsWorkbookMigration({ ...snapshot(), workbookId: "another-workbook" }),
    ).toThrow(/allowlisted/);
    expect(() =>
      planOperationsWorkbookMigration(
        snapshot({ Production_Orders: [...baseProductionHeaders, "unexpected_column"] }),
      ),
    ).toThrow(/conflicting extension/);
    expect(() =>
      planOperationsWorkbookMigration(snapshot({ Packaging_Materials: ["wrong_header"] })),
    ).toThrow(/conflicting schema/);
  });

  it("is idempotent after every header and tab is present", () => {
    const tabs: Record<string, readonly string[]> = {
      Production_Orders: [...baseProductionHeaders, ...OPERATIONS_PRODUCTION_ORDER_HEADERS],
    };
    for (const name of OPERATIONS_SCHEMA_TABS) {
      tabs[name] = MANUAL_TAB_CONTRACTS[name].columns.map(({ header }) => header);
    }
    const plan = planOperationsWorkbookMigration(snapshot(tabs));
    expect(plan).toMatchObject({
      changed: false,
      requiresBackup: false,
      productionOrderHeadersToAppend: [],
      tabsToAdd: [],
    });
  });
});

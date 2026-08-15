import {
  MANUAL_TAB_CONTRACTS,
  type ManualWorkbookTab,
} from "@/src/infrastructure/manual-workbook/contracts.generated";

export const OPERATIONS_PRODUCTION_WORKBOOK_ID = "1vOkSXadR0WAFmUgWUvZmxmOoxVs5fxYkIW3GT2FmjjA";

export const OPERATIONS_SCHEMA_TABS = [
  "Warehouse_Fulfillment",
  "Packaging_Materials",
  "Packaging_Inventory",
  "Packaging_Orders",
  "Packaging_Forecast",
] as const satisfies readonly ManualWorkbookTab[];

const productionOrdersBaseHeaders = [
  "record_id",
  "po_number",
  "sku",
  "units",
  "supplier",
  "order_date",
  "expected_date",
  "received_date",
  "received_units",
  "status",
  "unit_cost_usd",
  "freight_usd",
  "deposit_usd",
  "balance_usd",
  "payment_due_date",
  "source_status",
  "data_as_of",
  "created_at",
  "updated_at",
  "updated_by",
  "source_reference",
  "notes",
] as const;

export const OPERATIONS_PRODUCTION_ORDER_HEADERS = [
  "confirmed_date",
  "production_start_date",
  "destination_warehouse",
  "accepted_units",
] as const;

export interface WorkbookSchemaSnapshot {
  readonly workbookId: string;
  readonly tabs: Readonly<Record<string, readonly string[]>>;
}

export interface OperationsMigrationPlan {
  readonly mode: "dry-run" | "apply";
  readonly tabsToAdd: readonly {
    readonly name: (typeof OPERATIONS_SCHEMA_TABS)[number];
    readonly headers: readonly string[];
  }[];
  readonly productionOrderHeadersToAppend: readonly string[];
  readonly changed: boolean;
  readonly requiresBackup: boolean;
}

function assertExactHeaders(tab: string, actual: readonly string[], expected: readonly string[]) {
  if (
    actual.length !== expected.length ||
    actual.some((header, index) => header !== expected[index])
  ) {
    throw new Error(`${tab} has a conflicting schema; migration aborted.`);
  }
}

export function planOperationsWorkbookMigration(
  snapshot: WorkbookSchemaSnapshot,
  options: { readonly mode?: "dry-run" | "apply"; readonly writeOptIn?: boolean } = {},
): OperationsMigrationPlan {
  const mode = options.mode ?? "dry-run";
  if (snapshot.workbookId !== OPERATIONS_PRODUCTION_WORKBOOK_ID) {
    throw new Error("Workbook is not the allowlisted Operations production workbook.");
  }
  if (mode === "apply" && options.writeOptIn !== true) {
    throw new Error("Operations workbook writes require a dedicated opt-in.");
  }

  const productionOrders = snapshot.tabs["Production_Orders"];
  if (!productionOrders) throw new Error("Production_Orders is missing; migration aborted.");
  assertExactHeaders(
    "Production_Orders base columns",
    productionOrders.slice(0, productionOrdersBaseHeaders.length),
    productionOrdersBaseHeaders,
  );

  const extensionHeaders = productionOrders.slice(productionOrdersBaseHeaders.length);
  // week_ending is tolerated but never appended: the new operations workbook
  // carries it, the legacy one does not, and this planner only writes the
  // headers in OPERATIONS_PRODUCTION_ORDER_HEADERS.
  const allowedExtensions = new Set<string>([
    ...OPERATIONS_PRODUCTION_ORDER_HEADERS,
    "week_ending",
  ]);
  if (
    new Set(extensionHeaders).size !== extensionHeaders.length ||
    extensionHeaders.some((header) => !allowedExtensions.has(header))
  ) {
    throw new Error("Production_Orders has conflicting extension columns; migration aborted.");
  }
  const productionOrderHeadersToAppend = OPERATIONS_PRODUCTION_ORDER_HEADERS.filter(
    (header) => !extensionHeaders.includes(header),
  );

  const tabsToAdd = OPERATIONS_SCHEMA_TABS.flatMap((name) => {
    const expected = MANUAL_TAB_CONTRACTS[name].columns.map(({ header }) => header);
    const actual = snapshot.tabs[name];
    if (!actual) return [{ name, headers: expected }];
    assertExactHeaders(name, actual, expected);
    return [];
  });
  const changed = tabsToAdd.length > 0 || productionOrderHeadersToAppend.length > 0;

  return {
    mode,
    tabsToAdd,
    productionOrderHeadersToAppend,
    changed,
    requiresBackup: changed,
  };
}

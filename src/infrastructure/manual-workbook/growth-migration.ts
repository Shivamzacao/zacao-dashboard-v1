import { MANUAL_TAB_CONTRACTS } from "@/src/infrastructure/manual-workbook/contracts.generated";

export const GROWTH_PRODUCTION_WORKBOOK_ID = "1vOkSXadR0WAFmUgWUvZmxmOoxVs5fxYkIW3GT2FmjjA";
export const GROWTH_SCHEMA_TABS = ["Investor_Pipeline", "Grants"] as const;
export const GROWTH_PIPELINE_HEADERS = [
  "opportunity_id",
  "snapshot_date",
  "growth_category",
  "industry",
  "first_contact_date",
  "signed_date",
] as const;
export const GROWTH_PARTNER_HEADERS = ["attribution_source"] as const;

export interface GrowthWorkbookSchemaSnapshot {
  readonly workbookId: string;
  readonly tabs: Readonly<Record<string, readonly string[]>>;
}

export interface GrowthMigrationPlan {
  readonly mode: "dry-run" | "apply";
  readonly backupFilename: string | null;
  readonly tabsToAdd: readonly {
    readonly name: (typeof GROWTH_SCHEMA_TABS)[number];
    readonly headers: readonly string[];
  }[];
  readonly headersToAppend: Readonly<
    Record<"Affiliate_Ambassador_Perf" | "Growth_Pipeline", readonly string[]>
  >;
  readonly changed: boolean;
  readonly requiresBackup: boolean;
}

function baseHeaders(tab: "Affiliate_Ambassador_Perf" | "Growth_Pipeline") {
  const extensions =
    tab === "Growth_Pipeline"
      ? new Set<string>(GROWTH_PIPELINE_HEADERS)
      : new Set<string>(GROWTH_PARTNER_HEADERS);
  return MANUAL_TAB_CONTRACTS[tab].columns
    .map(({ header }) => header)
    .filter((header) => !extensions.has(header));
}

function missingExtensions(
  tab: string,
  actual: readonly string[],
  base: readonly string[],
  extensions: readonly string[],
) {
  const actualBase = actual.filter((header) => !extensions.includes(header));
  if (
    actualBase.length !== base.length ||
    actualBase.some((header, index) => header !== base[index])
  ) {
    throw new Error(`${tab} has a conflicting base schema; migration aborted.`);
  }
  const presentExtensions = actual.filter((header) => extensions.includes(header));
  if (new Set(presentExtensions).size !== presentExtensions.length) {
    throw new Error(`${tab} has duplicate extension columns; migration aborted.`);
  }
  return extensions.filter((header) => !presentExtensions.includes(header));
}

function assertExactHeaders(tab: string, actual: readonly string[], expected: readonly string[]) {
  if (
    actual.length !== expected.length ||
    actual.some((header, index) => header !== expected[index])
  ) {
    throw new Error(`${tab} has a conflicting schema; migration aborted.`);
  }
}

export function planGrowthWorkbookMigration(
  snapshot: GrowthWorkbookSchemaSnapshot,
  options: {
    readonly mode?: "dry-run" | "apply";
    readonly writeOptIn?: boolean;
    readonly now?: Date;
  } = {},
): GrowthMigrationPlan {
  const mode = options.mode ?? "dry-run";
  if (snapshot.workbookId !== GROWTH_PRODUCTION_WORKBOOK_ID) {
    throw new Error("Workbook is not the allowlisted Growth production workbook.");
  }
  if (mode === "apply" && options.writeOptIn !== true) {
    throw new Error("Growth workbook writes require a dedicated opt-in.");
  }
  const affiliate = snapshot.tabs["Affiliate_Ambassador_Perf"];
  const pipeline = snapshot.tabs["Growth_Pipeline"];
  if (!affiliate || !pipeline)
    throw new Error("Required Growth tabs are missing; migration aborted.");

  const partnerHeaders = missingExtensions(
    "Affiliate_Ambassador_Perf",
    affiliate,
    baseHeaders("Affiliate_Ambassador_Perf"),
    GROWTH_PARTNER_HEADERS,
  );
  const pipelineHeaders = missingExtensions(
    "Growth_Pipeline",
    pipeline,
    baseHeaders("Growth_Pipeline"),
    GROWTH_PIPELINE_HEADERS,
  );
  const tabsToAdd = GROWTH_SCHEMA_TABS.flatMap((name) => {
    const expected = MANUAL_TAB_CONTRACTS[name].columns.map(({ header }) => header);
    const actual = snapshot.tabs[name];
    if (!actual) return [{ name, headers: expected }];
    assertExactHeaders(name, actual, expected);
    return [];
  });
  const changed = tabsToAdd.length > 0 || partnerHeaders.length > 0 || pipelineHeaders.length > 0;
  const timestamp = (options.now ?? new Date()).toISOString().replaceAll(/[:.]/g, "-");
  return {
    mode,
    backupFilename: changed ? `zacao-growth-preflight-${timestamp}.xlsx` : null,
    tabsToAdd,
    headersToAppend: {
      Affiliate_Ambassador_Perf: partnerHeaders,
      Growth_Pipeline: pipelineHeaders,
    },
    changed,
    requiresBackup: changed,
  };
}

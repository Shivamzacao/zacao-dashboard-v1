import { MANUAL_TAB_CONTRACTS } from "@/src/infrastructure/manual-workbook/contracts.generated";

export const MARKETING_PRODUCTION_WORKBOOK_ID = "1vOkSXadR0WAFmUgWUvZmxmOoxVs5fxYkIW3GT2FmjjA";

export const MARKETING_SCHEMA_TABS = ["Social_Channel_Performance"] as const;

export const MARKETING_AFFILIATE_HEADERS = [
  "partner_type",
  "shopify_discount_code",
  "utm_source",
  "utm_campaign",
  "utm_content",
] as const;

export const MARKETING_COLLABORATION_HEADERS = [
  "collaboration_category",
  "audience_reach",
  "collaboration_lifecycle",
  "collaboration_start_date",
  "launch_date",
  "collaboration_end_date",
] as const;

const affiliateBaseHeaders = MANUAL_TAB_CONTRACTS.Affiliate_Ambassador_Perf.columns
  .map(({ header }) => header)
  .filter((header) => !MARKETING_AFFILIATE_HEADERS.includes(header as never));

const collaborationBaseHeaders = MANUAL_TAB_CONTRACTS.Growth_Pipeline.columns
  .map(({ header }) => header)
  .filter((header) => !MARKETING_COLLABORATION_HEADERS.includes(header as never));

export interface MarketingWorkbookSchemaSnapshot {
  readonly workbookId: string;
  readonly tabs: Readonly<Record<string, readonly string[]>>;
}

export interface MarketingMigrationPlan {
  readonly mode: "dry-run" | "apply";
  readonly tabsToAdd: readonly {
    readonly name: (typeof MARKETING_SCHEMA_TABS)[number];
    readonly headers: readonly string[];
  }[];
  readonly headersToAppend: Readonly<
    Record<"Affiliate_Ambassador_Perf" | "Growth_Pipeline", readonly string[]>
  >;
  readonly changed: boolean;
  readonly requiresBackup: boolean;
}

function assertBaseHeaders(
  tab: string,
  actual: readonly string[],
  base: readonly string[],
  allowedExtensions: readonly string[],
) {
  const prefix = actual.slice(0, base.length);
  if (prefix.some((header, index) => header !== base[index])) {
    throw new Error(`${tab} has a conflicting base schema; migration aborted.`);
  }
  const extensions = actual.slice(base.length);
  const allowed = new Set<string>(allowedExtensions);
  if (
    new Set(extensions).size !== extensions.length ||
    extensions.some((header) => !allowed.has(header))
  ) {
    throw new Error(`${tab} has conflicting extension columns; migration aborted.`);
  }
  return allowedExtensions.filter((header) => !extensions.includes(header));
}

function assertExactHeaders(tab: string, actual: readonly string[], expected: readonly string[]) {
  if (
    actual.length !== expected.length ||
    actual.some((header, index) => header !== expected[index])
  ) {
    throw new Error(`${tab} has a conflicting schema; migration aborted.`);
  }
}

export function planMarketingWorkbookMigration(
  snapshot: MarketingWorkbookSchemaSnapshot,
  options: { readonly mode?: "dry-run" | "apply"; readonly writeOptIn?: boolean } = {},
): MarketingMigrationPlan {
  const mode = options.mode ?? "dry-run";
  if (snapshot.workbookId !== MARKETING_PRODUCTION_WORKBOOK_ID) {
    throw new Error("Workbook is not the allowlisted Marketing production workbook.");
  }
  if (mode === "apply" && options.writeOptIn !== true) {
    throw new Error("Marketing workbook writes require a dedicated opt-in.");
  }

  const affiliate = snapshot.tabs["Affiliate_Ambassador_Perf"];
  const collaborations = snapshot.tabs["Growth_Pipeline"];
  if (!affiliate || !collaborations) {
    throw new Error("Required Marketing tabs are missing; migration aborted.");
  }

  const affiliateHeaders = assertBaseHeaders(
    "Affiliate_Ambassador_Perf",
    affiliate,
    affiliateBaseHeaders,
    MARKETING_AFFILIATE_HEADERS,
  );
  const collaborationHeaders = assertBaseHeaders(
    "Growth_Pipeline",
    collaborations,
    collaborationBaseHeaders,
    MARKETING_COLLABORATION_HEADERS,
  );
  const tabsToAdd = MARKETING_SCHEMA_TABS.flatMap((name) => {
    const expected = MANUAL_TAB_CONTRACTS[name].columns.map(({ header }) => header);
    const actual = snapshot.tabs[name];
    if (!actual) return [{ name, headers: expected }];
    assertExactHeaders(name, actual, expected);
    return [];
  });
  const changed =
    tabsToAdd.length > 0 || affiliateHeaders.length > 0 || collaborationHeaders.length > 0;

  return {
    mode,
    tabsToAdd,
    headersToAppend: {
      Affiliate_Ambassador_Perf: affiliateHeaders,
      Growth_Pipeline: collaborationHeaders,
    },
    changed,
    requiresBackup: changed,
  };
}

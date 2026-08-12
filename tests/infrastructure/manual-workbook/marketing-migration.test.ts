import { describe, expect, it } from "vitest";

import { MANUAL_TAB_CONTRACTS } from "@/src/infrastructure/manual-workbook/contracts.generated";
import {
  MARKETING_AFFILIATE_HEADERS,
  MARKETING_COLLABORATION_HEADERS,
  MARKETING_PRODUCTION_WORKBOOK_ID,
  MARKETING_SCHEMA_TABS,
  planMarketingWorkbookMigration,
} from "@/src/infrastructure/manual-workbook/marketing-migration";

const base = (
  tab: "Affiliate_Ambassador_Perf" | "Growth_Pipeline",
  extensions: readonly string[],
) =>
  MANUAL_TAB_CONTRACTS[tab].columns
    .map(({ header }) => header)
    .filter((header) => !extensions.includes(header));

const affiliateBase = base("Affiliate_Ambassador_Perf", MARKETING_AFFILIATE_HEADERS);
const collaborationBase = base("Growth_Pipeline", MARKETING_COLLABORATION_HEADERS);
const snapshot = (overrides: Readonly<Record<string, readonly string[]>> = {}) => ({
  workbookId: MARKETING_PRODUCTION_WORKBOOK_ID,
  tabs: {
    Affiliate_Ambassador_Perf: affiliateBase,
    Growth_Pipeline: collaborationBase,
    ...overrides,
  },
});

describe("Marketing workbook migration planner", () => {
  it("plans only additive, backed-up schema changes in dry-run mode", () => {
    const plan = planMarketingWorkbookMigration(snapshot());
    expect(plan).toMatchObject({ mode: "dry-run", changed: true, requiresBackup: true });
    expect(plan.tabsToAdd.map(({ name }) => name)).toEqual(MARKETING_SCHEMA_TABS);
    expect(plan.headersToAppend.Affiliate_Ambassador_Perf).toEqual(MARKETING_AFFILIATE_HEADERS);
    expect(plan.headersToAppend.Growth_Pipeline).toEqual(MARKETING_COLLABORATION_HEADERS);
  });

  it("requires a dedicated write opt-in for apply mode", () => {
    expect(() => planMarketingWorkbookMigration(snapshot(), { mode: "apply" })).toThrow(
      /dedicated opt-in/,
    );
    expect(
      planMarketingWorkbookMigration(snapshot(), { mode: "apply", writeOptIn: true }).mode,
    ).toBe("apply");
  });

  it("aborts on a non-allowlisted workbook and conflicting schemas", () => {
    expect(() =>
      planMarketingWorkbookMigration({ ...snapshot(), workbookId: "another-workbook" }),
    ).toThrow(/allowlisted/);
    expect(() =>
      planMarketingWorkbookMigration(
        snapshot({ Affiliate_Ambassador_Perf: [...affiliateBase, "unexpected_column"] }),
      ),
    ).toThrow(/conflicting extension/);
    expect(() =>
      planMarketingWorkbookMigration(snapshot({ Social_Channel_Performance: ["wrong_header"] })),
    ).toThrow(/conflicting schema/);
  });

  it("is idempotent after every tab and extension is present", () => {
    const plan = planMarketingWorkbookMigration(
      snapshot({
        Affiliate_Ambassador_Perf: [...affiliateBase, ...MARKETING_AFFILIATE_HEADERS],
        Growth_Pipeline: [...collaborationBase, ...MARKETING_COLLABORATION_HEADERS],
        Social_Channel_Performance: MANUAL_TAB_CONTRACTS.Social_Channel_Performance.columns.map(
          ({ header }) => header,
        ),
      }),
    );
    expect(plan).toMatchObject({
      changed: false,
      requiresBackup: false,
      tabsToAdd: [],
      headersToAppend: { Affiliate_Ambassador_Perf: [], Growth_Pipeline: [] },
    });
  });
});

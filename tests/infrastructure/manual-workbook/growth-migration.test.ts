import { describe, expect, it } from "vitest";

import { MANUAL_TAB_CONTRACTS } from "@/src/infrastructure/manual-workbook/contracts.generated";
import {
  GROWTH_PARTNER_HEADERS,
  GROWTH_PIPELINE_HEADERS,
  GROWTH_PRODUCTION_WORKBOOK_ID,
  GROWTH_SCHEMA_TABS,
  planGrowthWorkbookMigration,
} from "@/src/infrastructure/manual-workbook/growth-migration";

const without = (
  tab: "Affiliate_Ambassador_Perf" | "Growth_Pipeline",
  extensions: readonly string[],
) =>
  MANUAL_TAB_CONTRACTS[tab].columns
    .map(({ header }) => header)
    .filter((header) => !extensions.includes(header));
const affiliateBase = without("Affiliate_Ambassador_Perf", GROWTH_PARTNER_HEADERS);
const pipelineBase = without("Growth_Pipeline", GROWTH_PIPELINE_HEADERS);
const snapshot = (overrides: Readonly<Record<string, readonly string[]>> = {}) => ({
  workbookId: GROWTH_PRODUCTION_WORKBOOK_ID,
  tabs: { Affiliate_Ambassador_Perf: affiliateBase, Growth_Pipeline: pipelineBase, ...overrides },
});

describe("Growth workbook migration planner", () => {
  it("plans additive tabs and columns with a timestamped backup", () => {
    const plan = planGrowthWorkbookMigration(snapshot(), { now: new Date("2026-08-12T12:00:00Z") });
    expect(plan.tabsToAdd.map(({ name }) => name)).toEqual(GROWTH_SCHEMA_TABS);
    expect(plan.headersToAppend.Growth_Pipeline).toEqual(GROWTH_PIPELINE_HEADERS);
    expect(plan.headersToAppend.Affiliate_Ambassador_Perf).toEqual(GROWTH_PARTNER_HEADERS);
    expect(plan).toMatchObject({ changed: true, requiresBackup: true });
    expect(plan.backupFilename).toContain("2026-08-12T12-00-00-000Z");
  });

  it("requires the allowlist and dedicated apply opt-in", () => {
    expect(() => planGrowthWorkbookMigration({ ...snapshot(), workbookId: "wrong" })).toThrow(
      /allowlisted/,
    );
    expect(() => planGrowthWorkbookMigration(snapshot(), { mode: "apply" })).toThrow(
      /dedicated opt-in/,
    );
    expect(planGrowthWorkbookMigration(snapshot(), { mode: "apply", writeOptIn: true }).mode).toBe(
      "apply",
    );
  });

  it("aborts on conflicts and is idempotent after migration", () => {
    expect(() => planGrowthWorkbookMigration(snapshot({ Growth_Pipeline: ["wrong"] }))).toThrow(
      /conflicting base schema/,
    );
    const complete = planGrowthWorkbookMigration(
      snapshot({
        Affiliate_Ambassador_Perf: [...affiliateBase, ...GROWTH_PARTNER_HEADERS],
        Growth_Pipeline: [...pipelineBase, ...GROWTH_PIPELINE_HEADERS],
        Investor_Pipeline: MANUAL_TAB_CONTRACTS.Investor_Pipeline.columns.map(
          ({ header }) => header,
        ),
        Grants: MANUAL_TAB_CONTRACTS.Grants.columns.map(({ header }) => header),
      }),
    );
    expect(complete).toMatchObject({
      changed: false,
      requiresBackup: false,
      backupFilename: null,
      tabsToAdd: [],
    });
  });
});

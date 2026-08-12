import type { SheetRecord, SheetsTabReadResult } from "@/src/application/ports/sheets-tabs";
import type { SourceStatus } from "@/src/domain/contracts";

export const SYNTHETIC_EXAMPLE_DATA = "SYNTHETIC_EXAMPLE_DATA" as const;

export interface ExampleFallbackSelection {
  readonly rows: readonly SheetRecord[];
  readonly usedExample: boolean;
}

/**
 * Prefer genuine production rows. Example rows are eligible only when the
 * caller's metric-specific usability check confirms the production set cannot
 * produce a value. This prevents examples from supplementing real totals.
 */
export function selectExampleFallback(
  result: SheetsTabReadResult,
  tab: string,
  productionUsable: (rows: readonly SheetRecord[]) => boolean = (rows) => rows.length > 0,
): ExampleFallbackSelection {
  const production = result.tabs[tab] ?? [];
  if (productionUsable(production)) return { rows: production, usedExample: false };
  const examples = result.exampleTabs?.[tab] ?? [];
  return examples.length > 0
    ? { rows: examples, usedExample: true }
    : { rows: production, usedExample: false };
}

export function syntheticSourceStatus(status: SourceStatus, usedExample: boolean): SourceStatus {
  if (!usedExample) return status;
  return {
    ...status,
    state: "partial",
    completeness: "partial",
    warningCodes: [...new Set([...status.warningCodes, SYNTHETIC_EXAMPLE_DATA])],
  };
}

export function syntheticWarnings(
  warnings: readonly string[],
  usedExample: boolean,
): readonly string[] {
  return usedExample ? [...new Set([...warnings, SYNTHETIC_EXAMPLE_DATA])] : warnings;
}

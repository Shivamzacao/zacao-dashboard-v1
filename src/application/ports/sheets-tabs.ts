import type { SourceStatus } from "@/src/domain/contracts";

export type SheetCell = string | number | boolean | null;
export type SheetRecord = Readonly<Record<string, SheetCell>>;

export interface SheetsTabReadResult {
  readonly tabs: Readonly<Record<string, readonly SheetRecord[]>>;
  readonly sourceStatus: SourceStatus;
  readonly warnings: readonly string[];
}

export type SheetsDashboardPage =
  "insights" | "product" | "finance" | "marketing" | "growth" | "operations" | "customers";

/** Read-only, server-side source for normalized Google Sheet tab records. */
export interface SheetsTabDataSource {
  readPageTabs(
    page: SheetsDashboardPage,
    tabNames: readonly string[],
    signal?: AbortSignal,
  ): Promise<SheetsTabReadResult>;
  sourceStatus(): SourceStatus;
}

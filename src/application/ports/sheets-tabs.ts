import type { ManualStoreRecord } from "./manual-workbook";
import type { SourceStatus } from "@/src/domain/contracts";

export interface SheetsTabReadResult {
  readonly tabs: Readonly<Record<string, readonly ManualStoreRecord[]>>;
  readonly sourceStatus: SourceStatus;
  readonly warnings: readonly string[];
}

export type SheetsDashboardPage =
  "insights" | "product" | "finance" | "marketing" | "growth" | "operations";

/** Read-only, server-side source for normalized Google Sheet tab records. */
export interface SheetsTabDataSource {
  readPageTabs(
    page: SheetsDashboardPage,
    tabNames: readonly string[],
    signal?: AbortSignal,
  ): Promise<SheetsTabReadResult>;
  sourceStatus(): SourceStatus;
}

import type { SourceStatus } from "@/src/domain/contracts";

export type SheetCell = string | number | boolean | null;
export type SheetRecord = Readonly<Record<string, SheetCell>>;

export interface SheetsTabReadResult {
  readonly tabs: Readonly<Record<string, readonly SheetRecord[]>>;
  /**
   * Validated workbook rows explicitly labelled `source_status=example`.
   * Consumers must opt in to these rows and disclose their synthetic status;
   * they are never mixed into the production tab collection.
   */
  readonly exampleTabs?: Readonly<Record<string, readonly SheetRecord[]>>;
  readonly sourceStatus: SourceStatus;
  readonly warnings: readonly string[];
}

export type SheetsDashboardPage =
  | "insights"
  | "product"
  | "finance"
  | "marketing"
  | "growth"
  | "operations"
  // Pages already migrated onto the new workbook. They read the same tabs as their
  // legacy counterparts, so they need a distinct key to keep the two workbooks'
  // reads in separate cache entries — and sharing one key lets every migrated page
  // reuse a single cached read.
  | "migrated"
  | "customers";

/** Read-only, server-side source for normalized Google Sheet tab records. */
export interface SheetsTabDataSource {
  readPageTabs(
    page: SheetsDashboardPage,
    tabNames: readonly string[],
    signal?: AbortSignal,
  ): Promise<SheetsTabReadResult>;
  sourceStatus(): SourceStatus;
}

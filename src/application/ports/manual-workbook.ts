export type ManualStoreCell = string | number | boolean | null;
export type ManualStoreRecord = Readonly<Record<string, ManualStoreCell>>;

export interface ManualTabCommit {
  readonly tab: string;
  readonly records: readonly ManualStoreRecord[];
  readonly populatedRows: number;
  readonly issueCount: number;
}

export interface ManualCommitInput {
  readonly filename: string;
  readonly workbookState: string;
  readonly tabs: readonly ManualTabCommit[];
}

export interface ManualCommitResult {
  readonly uploadId: string;
  readonly batches: readonly {
    readonly batchId: string;
    readonly tab: string;
    readonly rowCount: number;
  }[];
}

export interface ManualBatchSummary {
  readonly batchId: string;
  readonly uploadId: string;
  readonly tab: string;
  readonly filename: string;
  readonly uploadedAt: string;
  readonly rowCount: number;
  readonly issueCount: number;
  readonly workbookState: string;
}

export interface ManualWorkbookStore {
  /** Persist one upload (all selected tabs) atomically; one batch per tab. */
  insertCommit(input: ManualCommitInput): Promise<ManualCommitResult>;
  /** Latest committed batch per tab. */
  latestCommittedBatches(): Promise<readonly ManualBatchSummary[]>;
  /** Production rows of the latest committed batch for one tab. */
  readTabRecords(tab: string): Promise<readonly ManualStoreRecord[]>;
  /** Most recent batches for the import history view. */
  recentBatches(limit: number): Promise<readonly ManualBatchSummary[]>;
}

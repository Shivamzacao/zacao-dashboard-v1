import { randomUUID } from "node:crypto";

import postgres from "postgres";

import type {
  ManualBatchSummary,
  ManualCommitInput,
  ManualCommitResult,
  ManualStoreRecord,
  ManualWorkbookStore,
} from "@/src/application/ports/manual-workbook";

import {
  MANUAL_TAB_CONTRACTS,
  MANUAL_WORKBOOK_TABS,
  PRODUCTION_SOURCE_STATUS,
  SOURCE_STATUS_COLUMN,
  type ManualWorkbookTab,
} from "./contracts.generated";

export interface ManualStoreConfiguration {
  readonly databaseUrl: string;
  readonly maxConnections?: number;
}

function contractFor(tab: string) {
  if (!(MANUAL_WORKBOOK_TABS as readonly string[]).includes(tab)) {
    throw new Error(`Unknown manual workbook tab: ${tab}`);
  }
  return MANUAL_TAB_CONTRACTS[tab as ManualWorkbookTab];
}

function batchSummary(row: Record<string, unknown>): ManualBatchSummary {
  return {
    batchId: String(row["id"]),
    uploadId: String(row["upload_id"]),
    tab: String(row["tab_name"]),
    filename: String(row["filename"]),
    uploadedAt: new Date(String(row["uploaded_at"])).toISOString(),
    rowCount: Number(row["row_count"]),
    issueCount: Number(row["issue_count"]),
    workbookState: String(row["workbook_state"]),
  };
}

/**
 * Postgres-backed store for versioned manual-workbook imports. Identifiers
 * (table and column names) come exclusively from the generated contracts —
 * never from request input — so dynamic SQL stays injection-safe.
 */
export class PostgresManualWorkbookStore implements ManualWorkbookStore {
  private readonly sql: postgres.Sql;

  constructor(configuration: ManualStoreConfiguration) {
    // Supabase transaction pooler requires prepare:false.
    this.sql = postgres(configuration.databaseUrl, {
      prepare: false,
      max: configuration.maxConnections ?? 4,
      connect_timeout: 10,
      idle_timeout: 30,
    });
  }

  async insertCommit(input: ManualCommitInput): Promise<ManualCommitResult> {
    const uploadId = randomUUID();
    const batches = await this.sql.begin(async (transaction) => {
      const created: { batchId: string; tab: string; rowCount: number }[] = [];
      for (const tabCommit of input.tabs) {
        const contract = contractFor(tabCommit.tab);
        const inserted = await transaction`
          insert into import_batches (upload_id, tab_name, filename, row_count, issue_count, workbook_state, committed)
          values (${uploadId}, ${tabCommit.tab}, ${input.filename}, ${tabCommit.records.length}, ${tabCommit.issueCount}, ${input.workbookState}, true)
          returning id
        `;
        const batchId = String(inserted[0]?.["id"]);
        const columns = contract.columns.map(({ header }) => header);
        for (const [rowIndex, record] of tabCommit.records.entries()) {
          const row: Record<string, unknown> = {
            batch_id: batchId,
            row_num: rowIndex + 1,
          };
          for (const column of columns) {
            row[column] = record[column] ?? null;
          }
          await transaction`
            insert into ${transaction(contract.tableName)} ${transaction(row, ...Object.keys(row))}
          `;
        }
        created.push({ batchId, tab: tabCommit.tab, rowCount: tabCommit.records.length });
      }
      return created;
    });
    return { uploadId, batches };
  }

  async latestCommittedBatches(): Promise<readonly ManualBatchSummary[]> {
    const rows = await this.sql`
      select b.id, b.upload_id, b.tab_name, b.filename, b.uploaded_at, b.row_count, b.issue_count, b.workbook_state
      from latest_committed_batches latest
      join import_batches b on b.id = latest.batch_id
      order by b.tab_name
    `;
    return rows.map(batchSummary);
  }

  async readTabRecords(tab: string): Promise<readonly ManualStoreRecord[]> {
    const contract = contractFor(tab);
    const rows = await this.sql`
      select data.*
      from ${this.sql(contract.tableName)} data
      join latest_committed_batches latest
        on latest.batch_id = data.batch_id and latest.tab_name = ${tab}
      order by data.row_num
    `;
    const numericKinds = new Set(["integer", "usd", "decimal", "percent"]);
    return rows
      .map((row) => {
        const record: Record<string, string | number | boolean | null> = {};
        for (const column of contract.columns) {
          const value = row[column.header];
          if (value === null || value === undefined) {
            record[column.header] = null;
          } else if (value instanceof Date) {
            record[column.header] = value.toISOString().slice(0, 10);
          } else if (typeof value === "number" || typeof value === "boolean") {
            record[column.header] = value;
          } else if (numericKinds.has(column.kind)) {
            // numeric()/integer columns can round-trip as text; restore by
            // the contract's declared kind — never by sniffing the value.
            record[column.header] = Number(String(value));
          } else {
            record[column.header] = String(value);
          }
        }
        return record;
      })
      .filter(
        (record) =>
          record[SOURCE_STATUS_COLUMN] === null ||
          record[SOURCE_STATUS_COLUMN] === PRODUCTION_SOURCE_STATUS,
      );
  }

  async recentBatches(limit: number): Promise<readonly ManualBatchSummary[]> {
    const bounded = Math.min(Math.max(1, Math.trunc(limit)), 100);
    const rows = await this.sql`
      select id, upload_id, tab_name, filename, uploaded_at, row_count, issue_count, workbook_state
      from import_batches
      where committed
      order by uploaded_at desc, id desc
      limit ${bounded}
    `;
    return rows.map(batchSummary);
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

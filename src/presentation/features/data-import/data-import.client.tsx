"use client";

import { useCallback, useRef, useState } from "react";

import type {
  ImportCommitApiData,
  ImportPreviewApiData,
  ImportTabReport,
} from "@/src/application/api";
import { CardShell, InsightCard } from "@/src/presentation/components/dashboard/cards";
import {
  DataTable,
  type DashboardTableColumn,
} from "@/src/presentation/components/dashboard/data-table.client";
import type { DisplayState } from "@/src/presentation/components/dashboard/display-contracts";
import { StateSurface } from "@/src/presentation/components/dashboard/state-surface";

import {
  commitWorkbook,
  fetchImportHistory,
  ImportApiError,
  previewWorkbook,
  type ApiProblemSummary,
} from "./api-client";

type Phase = "idle" | "validating" | "reviewing" | "saving" | "saved";

interface IssueRow extends Record<string, string | number | boolean | null> {
  readonly row: number | null;
  readonly column: string | null;
  readonly code: string;
  readonly message: string;
}

export interface HistoryRow extends Record<string, string | number | boolean | null> {
  readonly uploadedAt: string;
  readonly tab: string;
  readonly filename: string;
  readonly rowCount: number;
  readonly issueCount: number;
}

const ISSUE_COLUMNS: readonly DashboardTableColumn<IssueRow>[] = [
  { key: "row", label: "Row", numeric: true, sortable: true },
  { key: "column", label: "Column", sortable: true },
  { key: "code", label: "Issue", sortable: true },
  { key: "message", label: "Detail" },
];

const HISTORY_COLUMNS: readonly DashboardTableColumn<HistoryRow>[] = [
  { key: "uploadedAt", label: "Saved at", sortable: true },
  { key: "tab", label: "Sheet", sortable: true },
  { key: "filename", label: "File" },
  { key: "rowCount", label: "Rows", numeric: true, sortable: true },
  { key: "issueCount", label: "Issues", numeric: true, sortable: true },
];

/** Sheets worth showing: they hold rows, or they reported problems. */
function isRelevant(tab: ImportTabReport): boolean {
  return tab.populatedRows > 0 || tab.issues.length > 0;
}

function tabState(tab: ImportTabReport): DisplayState {
  const schemaIssue = tab.issues.some(({ code }) =>
    ["MISSING_TAB", "DUPLICATE_HEADER", "HEADER_MISMATCH"].includes(code),
  );
  if (schemaIssue) return "invalid";
  if (tab.acceptedRows === 0) return tab.populatedRows === 0 ? "empty" : "invalid";
  return tab.issues.length > 0 ? "partial" : "current";
}

export interface DataImportViewProps {
  /** Server-rendered so the page shows history without a client round-trip. */
  readonly initialHistory: readonly HistoryRow[];
  readonly initialStoreConfigured: boolean;
}

export function DataImportView({ initialHistory, initialStoreConfigured }: DataImportViewProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewApiData | null>(null);
  const [commit, setCommit] = useState<ImportCommitApiData | null>(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [problem, setProblem] = useState<ApiProblemSummary | null>(null);
  const [history, setHistory] = useState<readonly HistoryRow[]>(initialHistory);
  const [storeConfigured, setStoreConfigured] = useState<boolean>(initialStoreConfigured);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      const data = await fetchImportHistory();
      setStoreConfigured(data.storeConfigured);
      setHistory(
        data.batches.map((batch) => ({
          uploadedAt: batch.uploadedAt.replace("T", " ").slice(0, 16),
          tab: batch.tab,
          filename: batch.filename,
          rowCount: batch.rowCount,
          issueCount: batch.issueCount,
        })),
      );
    } catch {
      // Keep the last known history; the save result already reported success.
    }
  }, []);

  async function onFileSelected(selectedFile: File) {
    setFile(selectedFile);
    setPreview(null);
    setCommit(null);
    setProblem(null);
    setPhase("validating");
    try {
      const data = await previewWorkbook(selectedFile);
      setPreview(data);
      setStoreConfigured(data.storeConfigured);
      // Preselect every sheet that has accepted rows to save.
      setSelected(data.tabs.filter((tab) => tab.acceptedRows > 0).map((tab) => tab.tab));
      setPhase("reviewing");
    } catch (error) {
      setProblem(
        error instanceof ImportApiError
          ? error.problem
          : { title: "Upload failed", detail: String(error), fields: [] },
      );
      setPhase("idle");
    }
  }

  async function onSave() {
    if (!file || selected.length === 0) return;
    setPhase("saving");
    setProblem(null);
    try {
      const data = await commitWorkbook(file, selected);
      setCommit(data);
      setPhase("saved");
      await loadHistory();
    } catch (error) {
      setProblem(
        error instanceof ImportApiError
          ? error.problem
          : { title: "Save failed", detail: String(error), fields: [] },
      );
      setPhase("reviewing");
    }
  }

  // After a save, show the commit-time report — never the earlier preview.
  const report = commit?.tabs ?? preview?.tabs ?? [];
  const relevant = report.filter(isRelevant);
  const savableCount = report.filter((tab) => tab.acceptedRows > 0).length;

  return (
    <div className="data-import-page">
      <CardShell
        title="Upload the ZACAO input workbook"
        description="Rows are validated before anything is saved. Only rows marked production are stored, and every save keeps the previous version as history."
        eyebrow="Step 1 · Choose file"
      >
        <div className="import-file-row">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            aria-label="Workbook file"
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) void onFileSelected(chosen);
            }}
          />
          {file ? <span className="import-file-name">{file.name}</span> : null}
        </div>
        {phase === "validating" ? (
          <StateSurface
            state="loading"
            title="Validating workbook"
            description="Checking headers, controlled values, and row rules."
            compact
          />
        ) : null}
        {problem ? (
          <div role="alert" className="import-problem">
            <strong>{problem.title}</strong>
            <p>{problem.detail}</p>
            {problem.fields.length > 0 ? (
              <ul>
                {problem.fields.map((field) => (
                  <li key={`${field.path}-${field.message}`}>
                    {field.path}: {field.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {!storeConfigured ? (
          <StateSurface
            state="not_configured"
            title="Database not connected"
            description="Validation works, but saving needs DATABASE_URL configured and migrations applied."
            compact
          />
        ) : null}
      </CardShell>

      {preview || commit ? (
        <CardShell
          title="Sheets found in this workbook"
          description={`${savableCount} sheet(s) have rows ready to save. Untick anything you do not want stored.`}
          eyebrow="Step 2 · Review and select"
          actions={
            <button
              type="button"
              className="import-save-button"
              disabled={phase === "saving" || selected.length === 0 || !storeConfigured}
              onClick={() => void onSave()}
            >
              {phase === "saving" ? "Saving…" : `Save ${selected.length} sheet(s)`}
            </button>
          }
        >
          {relevant.length === 0 ? (
            <StateSurface
              state="empty"
              title="No data rows found"
              description="The workbook headers are valid but no sheet contains data rows yet."
              compact
            />
          ) : (
            <ul className="import-tab-list">
              {relevant.map((tab) => {
                const state = tabState(tab);
                const savable = tab.acceptedRows > 0;
                const issueRows: IssueRow[] = tab.issues.slice(0, 50).map((finding) => ({
                  row: finding.row,
                  column: finding.column,
                  code: finding.code,
                  message: finding.message,
                }));
                return (
                  <li key={tab.tab} className="import-tab-item">
                    <label className="import-tab-header">
                      <input
                        type="checkbox"
                        checked={selected.includes(tab.tab)}
                        disabled={!savable}
                        aria-label={`Save ${tab.tab}`}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, tab.tab]
                              : current.filter((entry) => entry !== tab.tab),
                          )
                        }
                      />
                      <span className="import-tab-name">{tab.tab}</span>
                      <span className="import-tab-counts">
                        {tab.acceptedRows} of {tab.populatedRows} row(s) ready
                        {tab.excludedRows > 0
                          ? ` · ${tab.excludedRows} draft/example excluded`
                          : ""}
                        {tab.issues.length > 0 ? ` · ${tab.issues.length} issue(s)` : ""}
                      </span>
                    </label>
                    {state !== "current" ? (
                      <StateSurface
                        state={state}
                        {...(state === "empty"
                          ? {
                              title: "No production rows",
                              description:
                                "Every row was excluded, so saving would blank this sheet.",
                            }
                          : {})}
                        compact
                      />
                    ) : null}
                    {issueRows.length > 0 ? (
                      <DataTable
                        caption={`${tab.tab} validation issues`}
                        columns={ISSUE_COLUMNS}
                        rows={issueRows}
                        rowKey={(row) => `${row.row}-${row.column}-${row.code}`}
                        page={0}
                        pageSize={10}
                        totalRows={issueRows.length}
                        onPageChange={() => undefined}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardShell>
      ) : null}

      {commit ? (
        <InsightCard
          title="Saved to the dashboard database"
          metadata={[`Upload ${commit.uploadId.slice(0, 8)}`, commit.filename]}
        >
          <p>
            {commit.savedTabs.length} sheet(s) saved:{" "}
            {commit.savedTabs.map(({ tab, rowCount }) => `${tab} (${rowCount})`).join(", ")}.
          </p>
          {commit.rejectedTabs.length > 0 ? (
            <p>
              Skipped:{" "}
              {commit.rejectedTabs.map(({ tab, reason }) => `${tab} — ${reason}`).join("; ")}
            </p>
          ) : null}
        </InsightCard>
      ) : null}

      <CardShell
        title="Import history"
        description="Every save is versioned; dashboards read the most recent save per sheet."
        eyebrow="Audit trail"
      >
        {history.length === 0 ? (
          <StateSurface
            state="empty"
            title="No imports yet"
            description="Saved workbook sheets will appear here."
            compact
          />
        ) : (
          <DataTable
            caption="Import history"
            columns={HISTORY_COLUMNS}
            rows={history}
            rowKey={(row) => `${row.uploadedAt}-${row.tab}`}
            page={0}
            pageSize={10}
            totalRows={history.length}
            onPageChange={() => undefined}
          />
        )}
      </CardShell>
    </div>
  );
}

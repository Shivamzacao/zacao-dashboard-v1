import { randomUUID } from "node:crypto";

import {
  ApiQueryError,
  importCommitApiDataSchema,
  importHistoryApiDataSchema,
  importPreviewApiDataSchema,
  type ImportTabReport,
} from "@/src/application/api";
import type { ManualWorkbookStore } from "@/src/application/ports/manual-workbook";
import { MANUAL_WORKBOOK_TABS } from "@/src/infrastructure/manual-workbook/contracts.generated";
import {
  validateManualWorkbook,
  type ManualWorkbookValidation,
} from "@/src/infrastructure/manual-workbook/parser";
import { parseWorkbookRows } from "@/src/infrastructure/manual-workbook/xlsx";

import { problemResponse, successResponse } from "./serialization";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function bypassCache(now: string) {
  return { state: "bypass" as const, generatedAt: now, expiresAt: null };
}

async function readUploadedWorkbook(
  request: Request,
): Promise<{ readonly bytes: Uint8Array; readonly filename: string; readonly form: FormData }> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    throw new ApiQueryError("The uploaded file exceeds the 10 MB limit", ["file"]);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiQueryError("Request must be multipart/form-data with a file field", ["file"]);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new ApiQueryError("A workbook file is required in the 'file' field", ["file"]);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiQueryError("The uploaded file exceeds the 10 MB limit", ["file"]);
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new ApiQueryError("Only .xlsx workbooks are accepted", ["file"]);
  }
  return { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name, form };
}

function tabReports(validation: ManualWorkbookValidation): ImportTabReport[] {
  return MANUAL_WORKBOOK_TABS.map((tab) => {
    const result = validation.tabs[tab];
    return {
      tab,
      populatedRows: result.populatedRows,
      acceptedRows: result.records.length,
      excludedRows: result.excludedRows,
      issues: result.issues.map((finding) => ({ ...finding })),
    };
  });
}

export function createImportApiHandlers(dependencies: {
  readonly store: ManualWorkbookStore | null;
  readonly now: () => Date;
}) {
  const { store, now } = dependencies;

  return {
    async preview(request: Request): Promise<Response> {
      const requestId = randomUUID();
      try {
        const upload = await readUploadedWorkbook(request);
        const parsed = await parseWorkbookRows(upload.bytes).catch(() => {
          throw new ApiQueryError("The uploaded file is not a readable .xlsx workbook", ["file"]);
        });
        const validation = validateManualWorkbook({ rowsBySheet: parsed.rowsBySheet });
        return successResponse({
          data: {
            filename: upload.filename,
            workbookState: validation.state,
            populatedRows: validation.populatedRows,
            acceptedRows: validation.acceptedRows,
            tabs: tabReports(validation),
            storeConfigured: store !== null,
          },
          dataSchema: importPreviewApiDataSchema,
          cache: bypassCache(now().toISOString()),
          sources: [],
          requestId,
        });
      } catch (error) {
        return problemResponse(error, requestId);
      }
    },

    async commit(request: Request): Promise<Response> {
      const requestId = randomUUID();
      try {
        if (!store) {
          throw new ApiQueryError(
            "MANUAL_WORKBOOK_NOT_CONFIGURED: set DATABASE_URL and run migrations before saving",
            ["store"],
          );
        }
        const upload = await readUploadedWorkbook(request);
        const selectedTabs = upload.form
          .getAll("tabs")
          .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
          .map((value) => value.trim())
          .filter((value) => value !== "");
        if (selectedTabs.length === 0) {
          throw new ApiQueryError("Select at least one tab to save", ["tabs"]);
        }
        const unknownTabs = selectedTabs.filter(
          (tab) => !(MANUAL_WORKBOOK_TABS as readonly string[]).includes(tab),
        );
        if (unknownTabs.length > 0) {
          throw new ApiQueryError(`Unknown workbook tabs: ${unknownTabs.join(", ")}`, ["tabs"]);
        }

        // Never trust an earlier preview: the commit re-validates the file it received.
        const parsed = await parseWorkbookRows(upload.bytes).catch(() => {
          throw new ApiQueryError("The uploaded file is not a readable .xlsx workbook", ["file"]);
        });
        const validation = validateManualWorkbook({ rowsBySheet: parsed.rowsBySheet });

        const savable: { tab: string; records: number }[] = [];
        const rejectedTabs: { tab: string; reason: string }[] = [];
        for (const tab of selectedTabs) {
          const result = validation.tabs[tab as (typeof MANUAL_WORKBOOK_TABS)[number]];
          const schemaIssue = result.issues.find(({ code }) =>
            ["MISSING_TAB", "DUPLICATE_HEADER", "HEADER_MISMATCH"].includes(code),
          );
          if (schemaIssue) {
            rejectedTabs.push({ tab, reason: `Schema problem: ${schemaIssue.code}` });
          } else if (result.records.length === 0) {
            rejectedTabs.push({
              tab,
              reason: "No accepted production rows; saving would blank the tab",
            });
          } else {
            savable.push({ tab, records: result.records.length });
          }
        }

        if (savable.length === 0) {
          throw new ApiQueryError(
            `No selected tab is savable: ${rejectedTabs
              .map(({ tab, reason }) => `${tab} (${reason})`)
              .join("; ")}`,
            ["tabs"],
          );
        }

        const commitResult = await store.insertCommit({
          filename: upload.filename,
          workbookState: validation.state,
          tabs: savable.map(({ tab }) => {
            const result = validation.tabs[tab as (typeof MANUAL_WORKBOOK_TABS)[number]];
            return {
              tab,
              records: result.records,
              populatedRows: result.populatedRows,
              issueCount: result.issues.length,
            };
          }),
        });

        return successResponse({
          data: {
            uploadId: commitResult.uploadId,
            filename: upload.filename,
            workbookState: validation.state,
            savedTabs: commitResult.batches.map((batch) => ({
              tab: batch.tab,
              batchId: batch.batchId,
              rowCount: batch.rowCount,
            })),
            rejectedTabs,
            tabs: tabReports(validation),
          },
          dataSchema: importCommitApiDataSchema,
          cache: bypassCache(now().toISOString()),
          sources: [],
          requestId,
        });
      } catch (error) {
        return problemResponse(error, requestId);
      }
    },

    async history(request: Request): Promise<Response> {
      const requestId = randomUUID();
      try {
        if ([...new URL(request.url).searchParams.keys()].length > 0) {
          throw new ApiQueryError("Import history does not accept query parameters");
        }
        const batches = store ? await store.recentBatches(50) : [];
        return successResponse({
          data: {
            storeConfigured: store !== null,
            batches: batches.map((batch) => ({ ...batch })),
          },
          dataSchema: importHistoryApiDataSchema,
          cache: bypassCache(now().toISOString()),
          sources: [],
          requestId,
        });
      } catch (error) {
        return problemResponse(error, requestId);
      }
    },
  };
}

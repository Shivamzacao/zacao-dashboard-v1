import { z } from "zod";

export const importIssueSchema = z
  .object({
    code: z.string().min(1),
    tab: z.string().min(1),
    row: z.number().int().nullable(),
    column: z.string().nullable(),
    message: z.string().min(1),
  })
  .strict();

export const importWorkbookStateSchema = z.enum([
  "ready",
  "data_source_not_ready",
  "partial",
  "invalid_schema",
  "invalid_data",
]);

export const importTabReportSchema = z
  .object({
    tab: z.string().min(1),
    populatedRows: z.number().int().min(0),
    acceptedRows: z.number().int().min(0),
    excludedRows: z.number().int().min(0),
    issues: z.array(importIssueSchema),
  })
  .strict();

export const importPreviewApiDataSchema = z
  .object({
    filename: z.string().min(1),
    workbookState: importWorkbookStateSchema,
    populatedRows: z.number().int().min(0),
    acceptedRows: z.number().int().min(0),
    tabs: z.array(importTabReportSchema),
    storeConfigured: z.boolean(),
  })
  .strict();

export const importCommitApiDataSchema = z
  .object({
    uploadId: z.string().min(1),
    filename: z.string().min(1),
    workbookState: importWorkbookStateSchema,
    savedTabs: z.array(
      z
        .object({
          tab: z.string().min(1),
          batchId: z.string().min(1),
          rowCount: z.number().int().min(0),
        })
        .strict(),
    ),
    rejectedTabs: z.array(z.object({ tab: z.string().min(1), reason: z.string().min(1) }).strict()),
    tabs: z.array(importTabReportSchema),
  })
  .strict();

export const importBatchSummarySchema = z
  .object({
    batchId: z.string().min(1),
    uploadId: z.string().min(1),
    tab: z.string().min(1),
    filename: z.string().min(1),
    uploadedAt: z.string().min(1),
    rowCount: z.number().int().min(0),
    issueCount: z.number().int().min(0),
    workbookState: z.string().min(1),
  })
  .strict();

export const importHistoryApiDataSchema = z
  .object({
    storeConfigured: z.boolean(),
    batches: z.array(importBatchSummarySchema),
  })
  .strict();

export type ImportTabReport = z.infer<typeof importTabReportSchema>;
export type ImportPreviewApiData = z.infer<typeof importPreviewApiDataSchema>;
export type ImportCommitApiData = z.infer<typeof importCommitApiDataSchema>;
export type ImportHistoryApiData = z.infer<typeof importHistoryApiDataSchema>;

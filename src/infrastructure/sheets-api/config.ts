import "server-only";

import { z } from "zod";

import {
  APPROVED_GOOGLE_FILE_IDS,
  parseGoogleCredential,
  type GoogleCredential,
} from "@/src/infrastructure/google/config";

export const DEFAULT_DASHBOARD_WORKBOOK_ID = "1vOkSXadR0WAFmUgWUvZmxmOoxVs5fxYkIW3GT2FmjjA";

export interface SheetsApiConfiguration {
  readonly workbookId: string;
  readonly credential: GoogleCredential;
  readonly timeoutMs: number;
  readonly rowChunkSize: number;
}

export function parseSheetsApiConfiguration(input: {
  readonly workbookId?: string;
  readonly projectId?: string;
  readonly clientEmail?: string;
  readonly privateKey?: string;
  readonly timeoutMs?: string;
  readonly rowChunkSize?: string;
}): SheetsApiConfiguration {
  const workbookId = z
    .string()
    .trim()
    .min(1)
    .parse(input.workbookId ?? DEFAULT_DASHBOARD_WORKBOOK_ID);
  if (workbookId !== APPROVED_GOOGLE_FILE_IDS.dashboardWorkbook) {
    throw new Error("Configured dashboard workbook ID is not allowlisted");
  }
  const timeoutMs = input.timeoutMs === undefined ? 30_000 : Number(input.timeoutMs);
  const rowChunkSize = input.rowChunkSize === undefined ? 1_000 : Number(input.rowChunkSize);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new Error("GOOGLE_SHEETS_REQUEST_TIMEOUT_MS must be an integer from 1000 to 60000");
  }
  if (!Number.isInteger(rowChunkSize) || rowChunkSize < 100 || rowChunkSize > 5_000) {
    throw new Error("GOOGLE_SHEETS_ROW_CHUNK_SIZE must be an integer from 100 to 5000");
  }
  return {
    workbookId,
    credential: parseGoogleCredential({
      projectId: input.projectId,
      clientEmail: input.clientEmail,
      privateKey: input.privateKey?.replaceAll("\\n", "\n"),
    }),
    timeoutMs,
    rowChunkSize,
  };
}

export function loadSheetsApiConfigurationOrNull(): SheetsApiConfiguration | null {
  const credentialValues = [
    process.env["GOOGLE_PROJECT_ID"],
    process.env["GOOGLE_CLIENT_EMAIL"],
    process.env["GOOGLE_PRIVATE_KEY"],
  ];
  if (credentialValues.every((value) => value === undefined)) return null;
  const optional = (name: string) => {
    const value = process.env[name];
    return value === undefined ? {} : { [name]: value };
  };
  const values = {
    ...optional("GOOGLE_SHEETS_DASHBOARD_WORKBOOK_ID"),
    ...optional("GOOGLE_PROJECT_ID"),
    ...optional("GOOGLE_CLIENT_EMAIL"),
    ...optional("GOOGLE_PRIVATE_KEY"),
    ...optional("GOOGLE_SHEETS_REQUEST_TIMEOUT_MS"),
    ...optional("GOOGLE_SHEETS_ROW_CHUNK_SIZE"),
  };
  return parseSheetsApiConfiguration({
    ...(values["GOOGLE_SHEETS_DASHBOARD_WORKBOOK_ID"]
      ? { workbookId: values["GOOGLE_SHEETS_DASHBOARD_WORKBOOK_ID"] }
      : {}),
    ...(values["GOOGLE_PROJECT_ID"] ? { projectId: values["GOOGLE_PROJECT_ID"] } : {}),
    ...(values["GOOGLE_CLIENT_EMAIL"] ? { clientEmail: values["GOOGLE_CLIENT_EMAIL"] } : {}),
    ...(values["GOOGLE_PRIVATE_KEY"] ? { privateKey: values["GOOGLE_PRIVATE_KEY"] } : {}),
    ...(values["GOOGLE_SHEETS_REQUEST_TIMEOUT_MS"]
      ? { timeoutMs: values["GOOGLE_SHEETS_REQUEST_TIMEOUT_MS"] }
      : {}),
    ...(values["GOOGLE_SHEETS_ROW_CHUNK_SIZE"]
      ? { rowChunkSize: values["GOOGLE_SHEETS_ROW_CHUNK_SIZE"] }
      : {}),
  });
}

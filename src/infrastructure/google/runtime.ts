import "server-only";

import {
  APPROVED_GOOGLE_FILE_IDS,
  parseGoogleCredential,
  parseGoogleSourceConfiguration,
  REQUIRED_GOOGLE_READ_SCOPES,
  type GoogleCredential,
  type GoogleSourceConfiguration,
} from "./config";

export function loadGoogleRuntimeConfiguration(
  environment: "test" | "production",
): GoogleSourceConfiguration {
  return parseGoogleSourceConfiguration({
    environment,
    testWorkbookId: process.env["GOOGLE_TEST_WORKBOOK_ID"],
    productionWorkbookId: process.env["GOOGLE_PRODUCTION_WORKBOOK_ID"],
    budgetWorkbookId:
      process.env["GOOGLE_BUDGET_WORKBOOK_ID"] ?? APPROVED_GOOGLE_FILE_IDS.budgetWorkbook,
    sopWorkbookId: process.env["GOOGLE_SOP_WORKBOOK_ID"] ?? APPROVED_GOOGLE_FILE_IDS.sopWorkbook,
    reportingTimeZone: process.env["REPORTING_TIMEZONE"],
    grantedScopes: [...REQUIRED_GOOGLE_READ_SCOPES],
    requestTimeoutMs: 10_000,
    rowChunkSize: 1_000,
  });
}

export function loadGoogleCredentialOrNull(): GoogleCredential | null {
  const values = {
    projectId: process.env["GOOGLE_PROJECT_ID"],
    clientEmail: process.env["GOOGLE_CLIENT_EMAIL"],
    privateKey: process.env["GOOGLE_PRIVATE_KEY"]?.replaceAll("\\n", "\n"),
  };
  if (Object.values(values).every((value) => value === undefined)) return null;
  return parseGoogleCredential(values);
}

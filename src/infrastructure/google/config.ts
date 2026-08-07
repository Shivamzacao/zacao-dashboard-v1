import { z } from "zod";

export const GOOGLE_SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
export const GOOGLE_DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const REQUIRED_GOOGLE_READ_SCOPES = [
  GOOGLE_SHEETS_READONLY_SCOPE,
  GOOGLE_DRIVE_READONLY_SCOPE,
] as const;

export const APPROVED_GOOGLE_FILE_IDS = {
  testWorkbook: "1h1SmzQaSX_sBAHTdYkh8wQJFyYS66Jg5_q-MFNShtkg",
  productionWorkbook: "1wj7RNZ0VNhaYDyWTU_MkJNYLdMPHe17u6ZYsmP-HwbM",
  budgetWorkbook: "1ccm6JvpLYmKSWoatG0UOiDAKe4XF1_-ZBZ18WwMcTzE",
  sopWorkbook: "1LIVRpc72FOLi_cYcFHbqkc_liF495jxs",
} as const;

const googleSourceConfigurationSchema = z
  .object({
    environment: z.enum(["test", "production"]),
    testWorkbookId: z.string().trim().min(1).optional(),
    productionWorkbookId: z.string().trim().min(1).optional(),
    budgetWorkbookId: z.string().trim().min(1),
    sopWorkbookId: z.string().trim().min(1),
    reportingTimeZone: z.literal("America/New_York"),
    grantedScopes: z.array(z.string().trim().min(1)),
    requestTimeoutMs: z.number().int().min(1_000).max(30_000),
    rowChunkSize: z.number().int().min(100).max(5_000),
  })
  .strict();

const googleCredentialSchema = z
  .object({
    projectId: z.string().trim().min(1),
    clientEmail: z.string().email(),
    privateKey: z.string().min(32),
  })
  .strict();

export interface GoogleSourceConfiguration extends z.infer<typeof googleSourceConfigurationSchema> {
  readonly activeWorkbookId: string;
}

export type GoogleCredential = z.infer<typeof googleCredentialSchema>;

export function assertGoogleReadOnlyScopes(scopes: readonly string[]): void {
  const allowed = new Set<string>(REQUIRED_GOOGLE_READ_SCOPES);
  const forbidden = scopes.filter((scope) => !allowed.has(scope));
  const missing = REQUIRED_GOOGLE_READ_SCOPES.filter((scope) => !scopes.includes(scope));
  if (forbidden.length > 0 || missing.length > 0) {
    throw new Error("Google runtime scopes must be the approved read-only Sheets and Drive scopes");
  }
}

export function parseGoogleSourceConfiguration(input: unknown): GoogleSourceConfiguration {
  const parsed = googleSourceConfigurationSchema.parse(input);
  assertGoogleReadOnlyScopes(parsed.grantedScopes);

  if (
    parsed.testWorkbookId !== undefined &&
    parsed.testWorkbookId !== APPROVED_GOOGLE_FILE_IDS.testWorkbook
  ) {
    throw new Error("Configured TEST workbook ID is not allowlisted");
  }
  if (
    parsed.productionWorkbookId !== undefined &&
    parsed.productionWorkbookId !== APPROVED_GOOGLE_FILE_IDS.productionWorkbook
  ) {
    throw new Error("Configured PRODUCTION workbook ID is not allowlisted");
  }
  if (parsed.budgetWorkbookId !== APPROVED_GOOGLE_FILE_IDS.budgetWorkbook) {
    throw new Error("Configured Budget workbook ID is not allowlisted");
  }
  if (parsed.sopWorkbookId !== APPROVED_GOOGLE_FILE_IDS.sopWorkbook) {
    throw new Error("Configured S&OP workbook ID is not allowlisted");
  }

  const activeWorkbookId =
    parsed.environment === "production" ? parsed.productionWorkbookId : parsed.testWorkbookId;
  if (activeWorkbookId === undefined) {
    throw new Error(`Google ${parsed.environment} workbook is not configured`);
  }
  if (
    parsed.environment === "production" &&
    activeWorkbookId === APPROVED_GOOGLE_FILE_IDS.testWorkbook
  ) {
    throw new Error("Production cannot use or fall back to the TEST workbook");
  }

  return { ...parsed, activeWorkbookId };
}

export function parseGoogleCredential(input: unknown): GoogleCredential {
  return googleCredentialSchema.parse(input);
}

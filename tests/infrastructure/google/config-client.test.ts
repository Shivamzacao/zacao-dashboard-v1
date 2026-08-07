import { describe, expect, it, vi } from "vitest";

import {
  APPROVED_GOOGLE_FILE_IDS,
  assertGoogleReadOnlyScopes,
  assertGoogleReadRequest,
  GoogleReadClient,
  parseGoogleSourceConfiguration,
  REQUIRED_GOOGLE_READ_SCOPES,
} from "@/src/infrastructure/google";

function configuration(environment: "test" | "production" = "test") {
  return {
    environment,
    testWorkbookId: APPROVED_GOOGLE_FILE_IDS.testWorkbook,
    productionWorkbookId: APPROVED_GOOGLE_FILE_IDS.productionWorkbook,
    budgetWorkbookId: APPROVED_GOOGLE_FILE_IDS.budgetWorkbook,
    sopWorkbookId: APPROVED_GOOGLE_FILE_IDS.sopWorkbook,
    reportingTimeZone: "America/New_York" as const,
    grantedScopes: [...REQUIRED_GOOGLE_READ_SCOPES],
    requestTimeoutMs: 5_000,
    rowChunkSize: 100,
  };
}

describe("Google fixed-ID configuration", () => {
  it("selects independently allowlisted TEST and PRODUCTION IDs", () => {
    expect(parseGoogleSourceConfiguration(configuration("test")).activeWorkbookId).toBe(
      APPROVED_GOOGLE_FILE_IDS.testWorkbook,
    );
    expect(parseGoogleSourceConfiguration(configuration("production")).activeWorkbookId).toBe(
      APPROVED_GOOGLE_FILE_IDS.productionWorkbook,
    );
  });

  it("fails closed for missing, changed, or TEST-as-production configuration", () => {
    expect(() =>
      parseGoogleSourceConfiguration({
        ...configuration("production"),
        productionWorkbookId: undefined,
      }),
    ).toThrow(/not configured/);
    expect(() =>
      parseGoogleSourceConfiguration({
        ...configuration("production"),
        productionWorkbookId: "other",
      }),
    ).toThrow(/not allowlisted/);
    expect(() =>
      parseGoogleSourceConfiguration({
        ...configuration("production"),
        productionWorkbookId: APPROVED_GOOGLE_FILE_IDS.testWorkbook,
      }),
    ).toThrow();
  });

  it("permits only the two approved read-only scopes and GET requests", () => {
    expect(() => assertGoogleReadOnlyScopes(REQUIRED_GOOGLE_READ_SCOPES)).not.toThrow();
    expect(() =>
      assertGoogleReadOnlyScopes([...REQUIRED_GOOGLE_READ_SCOPES, "drive:write"]),
    ).toThrow(/read-only/);
    expect(() =>
      assertGoogleReadRequest("GET", "https://sheets.googleapis.com/v4/spreadsheets/id"),
    ).not.toThrow();
    expect(() =>
      assertGoogleReadRequest(
        "POST",
        "https://sheets.googleapis.com/v4/spreadsheets/id:batchUpdate",
      ),
    ).toThrow(/GET/);
  });
});

describe("Google bounded dynamic row reads", () => {
  it("rejects reads for file IDs outside the fixed runtime allowlist", async () => {
    const client = new GoogleReadClient(parseGoogleSourceConfiguration(configuration()), {
      fetch: vi.fn(),
      accessToken: vi.fn(),
    });

    await expect(client.readFileMetadata("unapproved-file-id")).rejects.toThrow(
      "not in the approved runtime allowlist",
    );
  });

  it("chunks according to metadata-derived capacity and retains later populated rows", async () => {
    const requests: string[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      requests.push(decodeURIComponent(url.pathname));
      expect(init?.method).toBeUndefined();
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes("A1:B100"))
        return Response.json({
          values: [
            ["A", "B"],
            ["early", 1],
          ],
        });
      if (decoded.includes("A201:B250"))
        return Response.json({ values: [[], [], [], [], ["late", 2]] });
      return Response.json({ values: [] });
    });
    const client = new GoogleReadClient(parseGoogleSourceConfiguration(configuration()), {
      fetch: fetchMock,
      accessToken: async () => "sanitized-token",
    });
    const rows = await client.readTabRows({
      spreadsheetId: APPROVED_GOOGLE_FILE_IDS.testWorkbook,
      sheetTitle: "Inventory",
      lastColumn: "B",
      physicalRowCount: 250,
    });
    expect(requests).toHaveLength(3);
    expect(rows[0]).toEqual(["A", "B"]);
    expect(rows[204]).toEqual(["late", 2]);
  });
});

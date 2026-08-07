import type { GoogleSourceConfiguration } from "./config";

const SHEETS_ORIGIN = "https://sheets.googleapis.com";
const DRIVE_ORIGIN = "https://www.googleapis.com";

export type GoogleFailureKind =
  | "cancelled"
  | "timeout"
  | "authentication"
  | "permission"
  | "not_found"
  | "http"
  | "malformed_response"
  | "network";

export class GoogleClientError extends Error {
  constructor(
    readonly kind: GoogleFailureKind,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GoogleClientError";
  }
}

export interface GoogleFileMetadata {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly modifiedTime: string | null;
  readonly size: string | null;
}

export interface GoogleSheetMetadata {
  readonly title: string;
  readonly rowCount: number;
  readonly columnCount: number;
}

export interface GoogleSpreadsheetMetadata {
  readonly spreadsheetId: string;
  readonly title: string;
  readonly timeZone: string;
  readonly sheets: readonly GoogleSheetMetadata[];
}

export interface GoogleReadTransport {
  readFileMetadata(fileId: string, signal?: AbortSignal): Promise<GoogleFileMetadata>;
  readSpreadsheetMetadata(
    spreadsheetId: string,
    signal?: AbortSignal,
  ): Promise<GoogleSpreadsheetMetadata>;
  readTabRows(input: {
    readonly spreadsheetId: string;
    readonly sheetTitle: string;
    readonly lastColumn: string;
    readonly physicalRowCount: number;
    readonly renderOption?: "UNFORMATTED_VALUE" | "FORMATTED_VALUE" | "FORMULA";
    readonly signal?: AbortSignal;
  }): Promise<readonly (readonly unknown[])[]>;
  downloadFile(fileId: string, signal?: AbortSignal): Promise<Uint8Array>;
}

interface GoogleClientDependencies {
  readonly fetch: typeof fetch;
  readonly accessToken: () => Promise<string>;
}

interface SheetsMetadataResponse {
  readonly spreadsheetId?: unknown;
  readonly properties?: { readonly title?: unknown; readonly timeZone?: unknown };
  readonly sheets?: readonly {
    readonly properties?: {
      readonly title?: unknown;
      readonly gridProperties?: { readonly rowCount?: unknown; readonly columnCount?: unknown };
    };
  }[];
}

interface ValuesResponse {
  readonly values?: readonly (readonly unknown[])[];
}

function failureKind(status: number): GoogleFailureKind {
  if (status === 401) return "authentication";
  if (status === 403) return "permission";
  if (status === 404) return "not_found";
  return "http";
}

function retryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function assertReadUrl(url: URL): void {
  if (url.origin !== SHEETS_ORIGIN && url.origin !== DRIVE_ORIGIN) {
    throw new Error("Google request URL is outside the approved read-only API origins");
  }
  if (
    /(?:batchUpdate|:append|:clear|\/permissions|\/upload\/|\/files\/[^/?]+\/(?:copy|update))/i.test(
      url.pathname,
    )
  ) {
    throw new Error("Google write-capable API paths are prohibited");
  }
}

export class GoogleReadClient implements GoogleReadTransport {
  private readonly allowedFileIds: ReadonlySet<string>;

  constructor(
    private readonly configuration: GoogleSourceConfiguration,
    private readonly dependencies: GoogleClientDependencies,
  ) {
    this.allowedFileIds = new Set([
      configuration.activeWorkbookId,
      configuration.budgetWorkbookId,
      configuration.sopWorkbookId,
    ]);
  }

  async readFileMetadata(fileId: string, signal?: AbortSignal): Promise<GoogleFileMetadata> {
    this.assertAllowedFile(fileId);
    const url = new URL(`/drive/v3/files/${encodeURIComponent(fileId)}`, DRIVE_ORIGIN);
    url.searchParams.set("fields", "id,name,mimeType,modifiedTime,size");
    const body = await this.readJson<unknown>(url, signal);
    if (!body || typeof body !== "object") {
      throw new GoogleClientError(
        "malformed_response",
        "Google Drive returned invalid metadata",
        false,
      );
    }
    const value = body as Record<string, unknown>;
    if (
      typeof value["id"] !== "string" ||
      typeof value["name"] !== "string" ||
      typeof value["mimeType"] !== "string"
    ) {
      throw new GoogleClientError(
        "malformed_response",
        "Google Drive metadata is incomplete",
        false,
      );
    }
    return {
      id: value["id"],
      name: value["name"],
      mimeType: value["mimeType"],
      modifiedTime: typeof value["modifiedTime"] === "string" ? value["modifiedTime"] : null,
      size: typeof value["size"] === "string" ? value["size"] : null,
    };
  }

  async readSpreadsheetMetadata(
    spreadsheetId: string,
    signal?: AbortSignal,
  ): Promise<GoogleSpreadsheetMetadata> {
    this.assertAllowedFile(spreadsheetId);
    const url = new URL(`/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`, SHEETS_ORIGIN);
    url.searchParams.set(
      "fields",
      "spreadsheetId,properties(title,timeZone),sheets(properties(title,gridProperties(rowCount,columnCount)))",
    );
    const body = await this.readJson<SheetsMetadataResponse>(url, signal);
    if (
      typeof body.spreadsheetId !== "string" ||
      typeof body.properties?.title !== "string" ||
      typeof body.properties.timeZone !== "string" ||
      !Array.isArray(body.sheets)
    ) {
      throw new GoogleClientError(
        "malformed_response",
        "Google Sheets metadata is incomplete",
        false,
      );
    }
    const sheets = body.sheets.map(({ properties }) => {
      const rowCount = properties?.gridProperties?.rowCount;
      const columnCount = properties?.gridProperties?.columnCount;
      if (
        typeof properties?.title !== "string" ||
        typeof rowCount !== "number" ||
        typeof columnCount !== "number"
      ) {
        throw new GoogleClientError(
          "malformed_response",
          "Google Sheet tab metadata is incomplete",
          false,
        );
      }
      return { title: properties.title, rowCount, columnCount };
    });
    return {
      spreadsheetId: body.spreadsheetId,
      title: body.properties.title,
      timeZone: body.properties.timeZone,
      sheets,
    };
  }

  async readTabRows(input: {
    readonly spreadsheetId: string;
    readonly sheetTitle: string;
    readonly lastColumn: string;
    readonly physicalRowCount: number;
    readonly renderOption?: "UNFORMATTED_VALUE" | "FORMATTED_VALUE" | "FORMULA";
    readonly signal?: AbortSignal;
  }): Promise<readonly (readonly unknown[])[]> {
    this.assertAllowedFile(input.spreadsheetId);
    const rows: (readonly unknown[])[] = [];
    const renderOption = input.renderOption ?? "UNFORMATTED_VALUE";
    for (
      let startRow = 1;
      startRow <= input.physicalRowCount;
      startRow += this.configuration.rowChunkSize
    ) {
      const endRow = Math.min(
        input.physicalRowCount,
        startRow + this.configuration.rowChunkSize - 1,
      );
      const range = `'${input.sheetTitle.replaceAll("'", "''")}'!A${startRow}:${input.lastColumn}${endRow}`;
      const url = new URL(
        `/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(range)}`,
        SHEETS_ORIGIN,
      );
      url.searchParams.set("majorDimension", "ROWS");
      url.searchParams.set("valueRenderOption", renderOption);
      if (renderOption === "UNFORMATTED_VALUE") {
        url.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");
      }
      const body = await this.readJson<ValuesResponse>(url, input.signal);
      for (let index = 0; index < (body.values?.length ?? 0); index += 1) {
        rows[startRow - 1 + index] = body.values?.[index] ?? [];
      }
    }
    let finalLength = rows.length;
    while (
      finalLength > 0 &&
      (rows[finalLength - 1] ?? []).every(
        (value) => value === null || value === undefined || value === "",
      )
    ) {
      finalLength -= 1;
    }
    return rows.slice(0, finalLength);
  }

  async downloadFile(fileId: string, signal?: AbortSignal): Promise<Uint8Array> {
    this.assertAllowedFile(fileId);
    const url = new URL(`/drive/v3/files/${encodeURIComponent(fileId)}`, DRIVE_ORIGIN);
    url.searchParams.set("alt", "media");
    const response = await this.fetchRead(url, signal);
    return new Uint8Array(await response.arrayBuffer());
  }

  private async readJson<T>(url: URL, signal?: AbortSignal): Promise<T> {
    const response = await this.fetchRead(url, signal);
    try {
      return (await response.json()) as T;
    } catch {
      throw new GoogleClientError("malformed_response", "Google returned invalid JSON", false);
    }
  }

  private assertAllowedFile(fileId: string): void {
    if (!this.allowedFileIds.has(fileId)) {
      throw new Error("Google file ID is not in the approved runtime allowlist");
    }
  }

  private async fetchRead(url: URL, externalSignal?: AbortSignal): Promise<Response> {
    assertReadUrl(url);
    const timeoutSignal = AbortSignal.timeout(this.configuration.requestTimeoutMs);
    const signal = externalSignal
      ? AbortSignal.any([externalSignal, timeoutSignal])
      : timeoutSignal;
    try {
      const accessToken = await this.dependencies.accessToken();
      const response = await this.dependencies.fetch(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
        signal,
      });
      if (!response.ok) {
        throw new GoogleClientError(
          failureKind(response.status),
          `Google read returned HTTP ${response.status}`,
          retryableStatus(response.status),
        );
      }
      return response;
    } catch (error) {
      if (error instanceof GoogleClientError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new GoogleClientError(
          externalSignal?.aborted ? "cancelled" : "timeout",
          externalSignal?.aborted ? "Google read was cancelled" : "Google read timed out",
          !externalSignal?.aborted,
        );
      }
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new GoogleClientError("timeout", "Google read timed out", true);
      }
      throw new GoogleClientError("network", "Google read failed", true);
    }
  }
}

export function assertGoogleReadRequest(method: string, url: string): void {
  if (method !== "GET") throw new Error("Google runtime integration permits GET requests only");
  assertReadUrl(new URL(url));
}

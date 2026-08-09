import type {
  ImportCommitApiData,
  ImportHistoryApiData,
  ImportPreviewApiData,
} from "@/src/application/api";

export interface ApiProblemSummary {
  readonly title: string;
  readonly detail: string;
  readonly fields: readonly { readonly path: string; readonly message: string }[];
}

export class ImportApiError extends Error {
  constructor(readonly problem: ApiProblemSummary) {
    super(problem.detail || problem.title);
    this.name = "ImportApiError";
  }
}

function problemFrom(body: unknown, status: number): ApiProblemSummary {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const errors = Array.isArray(record["errors"]) ? record["errors"] : [];
    return {
      title: typeof record["title"] === "string" ? record["title"] : `Request failed (${status})`,
      detail: typeof record["detail"] === "string" ? record["detail"] : "",
      fields: errors.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const field = entry as Record<string, unknown>;
        return [
          {
            path: typeof field["path"] === "string" ? field["path"] : "",
            message: typeof field["message"] === "string" ? field["message"] : "",
          },
        ];
      }),
    };
  }
  return { title: `Request failed (${status})`, detail: "", fields: [] };
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ImportApiError(problemFrom(body, response.status));
  }
  const record = body as { ok?: boolean; data?: T } | null;
  if (!record?.ok || record.data === undefined) {
    throw new ImportApiError({
      title: "Unexpected response",
      detail: "The server returned an unreadable response.",
      fields: [],
    });
  }
  return record.data;
}

export async function previewWorkbook(file: File): Promise<ImportPreviewApiData> {
  const form = new FormData();
  form.set("file", file);
  // Content-Type is intentionally unset so the browser adds the multipart boundary.
  const response = await fetch("/api/v1/imports/preview", { method: "POST", body: form });
  return readEnvelope<ImportPreviewApiData>(response);
}

export async function commitWorkbook(
  file: File,
  tabs: readonly string[],
): Promise<ImportCommitApiData> {
  const form = new FormData();
  form.set("file", file);
  for (const tab of tabs) form.append("tabs", tab);
  const response = await fetch("/api/v1/imports/commit", { method: "POST", body: form });
  return readEnvelope<ImportCommitApiData>(response);
}

export async function fetchImportHistory(): Promise<ImportHistoryApiData> {
  const response = await fetch("/api/v1/imports", { method: "GET" });
  return readEnvelope<ImportHistoryApiData>(response);
}

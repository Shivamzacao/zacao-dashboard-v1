import type { KlaviyoConfiguration } from "./config";

const KLAVIYO_API_ORIGIN = "https://a.klaviyo.com";
const ALLOWED_POST_PATHS = new Set([
  "/api/campaign-values-reports",
  "/api/flow-values-reports",
  "/api/metric-aggregates",
]);

export type KlaviyoFailureKind =
  | "cancelled"
  | "timeout"
  | "throttled"
  | "authentication"
  | "permission"
  | "http"
  | "malformed_response"
  | "network";

export class KlaviyoClientError extends Error {
  constructor(
    readonly kind: KlaviyoFailureKind,
    message: string,
    readonly retryable: boolean,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "KlaviyoClientError";
  }
}

export interface KlaviyoResponse<T> {
  readonly body: T;
  readonly requestId: string | null;
  readonly rateLimitRemaining: number | null;
}

export interface KlaviyoClientDependencies {
  readonly fetch: typeof fetch;
  readonly sleep: (milliseconds: number) => Promise<void>;
}

const defaultDependencies: KlaviyoClientDependencies = {
  fetch,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

function assertAllowedRequest(method: "GET" | "POST", url: URL): void {
  if (url.origin !== KLAVIYO_API_ORIGIN || !url.pathname.startsWith("/api/")) {
    throw new Error("Klaviyo request URL is outside the approved API origin");
  }
  if (method === "POST" && !ALLOWED_POST_PATHS.has(url.pathname)) {
    throw new Error("Klaviyo POST is permitted only for audited read/report endpoints");
  }
}

function statusKind(status: number): KlaviyoFailureKind {
  if (status === 401) return "authentication";
  if (status === 403) return "permission";
  if (status === 429) return "throttled";
  return "http";
}

function retryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export class KlaviyoClient {
  private readonly dependencies: KlaviyoClientDependencies;

  constructor(
    private readonly configuration: KlaviyoConfiguration,
    dependencies: Partial<KlaviyoClientDependencies> = {},
  ) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  get<T>(pathOrUrl: string, signal?: AbortSignal): Promise<KlaviyoResponse<T>> {
    return this.request<T>("GET", pathOrUrl, undefined, signal);
  }

  postReport<T>(path: string, body: unknown, signal?: AbortSignal): Promise<KlaviyoResponse<T>> {
    return this.request<T>("POST", path, body, signal);
  }

  private async request<T>(
    method: "GET" | "POST",
    pathOrUrl: string,
    body?: unknown,
    externalSignal?: AbortSignal,
  ): Promise<KlaviyoResponse<T>> {
    const url = new URL(pathOrUrl, KLAVIYO_API_ORIGIN);
    assertAllowedRequest(method, url);

    for (let attempt = 0; attempt <= this.configuration.maxRetries; attempt += 1) {
      try {
        return await this.requestAttempt<T>(method, url, body, externalSignal);
      } catch (error) {
        const clientError = this.toClientError(error, externalSignal);
        if (!clientError.retryable || attempt === this.configuration.maxRetries) throw clientError;
        await this.dependencies.sleep(100 * 2 ** attempt);
      }
    }
    throw new KlaviyoClientError("network", "Klaviyo request failed", false, null);
  }

  private async requestAttempt<T>(
    method: "GET" | "POST",
    url: URL,
    body?: unknown,
    externalSignal?: AbortSignal,
  ): Promise<KlaviyoResponse<T>> {
    const timeoutSignal = AbortSignal.timeout(this.configuration.timeoutMs);
    const signal = externalSignal
      ? AbortSignal.any([externalSignal, timeoutSignal])
      : timeoutSignal;
    const response = await this.dependencies.fetch(url, {
      method,
      headers: {
        Accept: "application/vnd.api+json",
        Authorization: `Klaviyo-API-Key ${this.configuration.privateApiKey}`,
        revision: this.configuration.apiRevision,
        ...(method === "POST" ? { "Content-Type": "application/vnd.api+json" } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
    const requestId = response.headers.get("x-request-id");
    if (!response.ok) {
      throw new KlaviyoClientError(
        statusKind(response.status),
        `Klaviyo returned HTTP ${response.status}`,
        retryableStatus(response.status),
        requestId,
      );
    }
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      throw new KlaviyoClientError(
        "malformed_response",
        "Klaviyo returned invalid JSON",
        false,
        requestId,
      );
    }
    if (!responseBody || typeof responseBody !== "object") {
      throw new KlaviyoClientError(
        "malformed_response",
        "Klaviyo returned an invalid JSON:API document",
        false,
        requestId,
      );
    }
    const remainingHeader = response.headers.get("ratelimit-remaining");
    const remaining = remainingHeader === null ? null : Number(remainingHeader);
    return {
      body: responseBody as T,
      requestId,
      rateLimitRemaining: remaining !== null && Number.isFinite(remaining) ? remaining : null,
    };
  }

  private toClientError(error: unknown, externalSignal?: AbortSignal): KlaviyoClientError {
    if (error instanceof KlaviyoClientError) return error;
    if (error instanceof DOMException && error.name === "AbortError") {
      return new KlaviyoClientError(
        externalSignal?.aborted ? "cancelled" : "timeout",
        externalSignal?.aborted ? "Klaviyo request was cancelled" : "Klaviyo request timed out",
        !externalSignal?.aborted,
        null,
      );
    }
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return new KlaviyoClientError("timeout", "Klaviyo request timed out", true, null);
    }
    return new KlaviyoClientError("network", "Klaviyo network request failed", true, null);
  }
}

export function assertKlaviyoReadRequest(method: string, url: string): void {
  if (method !== "GET" && method !== "POST") {
    throw new Error("Klaviyo adapter supports read requests only");
  }
  assertAllowedRequest(method, new URL(url, KLAVIYO_API_ORIGIN));
}

import { z } from "zod";

import { assertReadOnlyGraphQl } from "./admin-graphql/queries";
import type { ShopifyConfiguration } from "./config";

const graphqlEnvelopeSchema = z
  .object({
    data: z.unknown().optional(),
    errors: z.array(z.object({ message: z.string() }).passthrough()).optional(),
    extensions: z
      .object({
        cost: z
          .object({
            requestedQueryCost: z.number().optional(),
            actualQueryCost: z.number().optional(),
            throttleStatus: z
              .object({
                maximumAvailable: z.number(),
                currentlyAvailable: z.number(),
                restoreRate: z.number(),
              })
              .optional(),
          })
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ShopifyFailureKind =
  | "cancelled"
  | "timeout"
  | "throttled"
  | "authentication"
  | "permission"
  | "http"
  | "graphql"
  | "malformed_response"
  | "network";

export class ShopifyClientError extends Error {
  constructor(
    readonly kind: ShopifyFailureKind,
    message: string,
    readonly retryable: boolean,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "ShopifyClientError";
  }
}

export interface ShopifyThrottleStatus {
  readonly maximumAvailable: number;
  readonly currentlyAvailable: number;
  readonly restoreRate: number;
}

export interface ShopifyGraphQlResult<T> {
  readonly data: T;
  readonly requestId: string | null;
  readonly throttleStatus: ShopifyThrottleStatus | null;
}

export interface ShopifyClientDependencies {
  readonly fetch: typeof fetch;
  readonly sleep: (milliseconds: number) => Promise<void>;
  /** Injected so retry jitter stays deterministic under test. */
  readonly random: () => number;
}

export interface ShopifyClientAccessToken {
  readonly getToken: () => Promise<string>;
  readonly invalidate: () => void;
}

const defaultDependencies: ShopifyClientDependencies = {
  fetch,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random: Math.random,
};

/**
 * ShopifyQL enforces a per-minute analytics quota separate from the GraphQL
 * cost budget, and it refills continuously rather than in fixed windows — so
 * a throttled query recovers in about a second, not a minute. Backoff stays
 * short and carries full jitter because a dashboard page fans several queries
 * out at once; identical delays would just re-collide on the next wave.
 */
function retryDelayMilliseconds(
  kind: ShopifyFailureKind,
  attempt: number,
  random: () => number,
): number {
  const base = kind === "throttled" ? 1_000 * 2 ** attempt : 100 * 2 ** attempt;
  return Math.round(Math.min(base, MAX_RETRY_DELAY_MS) * (0.5 + random() * 0.5));
}

const MAX_RETRY_DELAY_MS = 4_000;

/**
 * Throttling gets its own, larger budget than `maxRetries`. A quota dip is
 * transient and shared across the page's queries, so giving up after two
 * attempts degraded a healthy dataset to "unavailable" and published partial
 * figures. Waiting a few seconds for real data beats disclosing a gap that
 * was never a gap.
 */
const MAX_THROTTLE_RETRIES = 3;

function statusKind(status: number): ShopifyFailureKind {
  if (status === 401) return "authentication";
  if (status === 403) return "permission";
  if (status === 429) return "throttled";
  return "http";
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export class ShopifyGraphQlClient {
  private readonly dependencies: ShopifyClientDependencies;

  constructor(
    private readonly configuration: ShopifyConfiguration,
    private readonly accessToken: ShopifyClientAccessToken,
    dependencies: Partial<ShopifyClientDependencies> = {},
  ) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  async execute<T>(input: {
    document: string;
    variables?: Readonly<Record<string, unknown>>;
    signal?: AbortSignal;
  }): Promise<ShopifyGraphQlResult<T>> {
    assertReadOnlyGraphQl(input.document);

    let refreshedExpiredToken = false;
    let throttleRetries = 0;
    let transientRetries = 0;
    for (;;) {
      try {
        return await this.executeAttempt<T>(input);
      } catch (error) {
        const clientError = this.toClientError(error, input.signal);
        if (clientError.kind === "authentication" && !refreshedExpiredToken) {
          // A cached token may have expired mid-window; mint once and retry.
          refreshedExpiredToken = true;
          this.accessToken.invalidate();
          continue;
        }
        if (!clientError.retryable) throw clientError;
        const throttled = clientError.kind === "throttled";
        const used = throttled ? throttleRetries : transientRetries;
        const budget = throttled ? MAX_THROTTLE_RETRIES : this.configuration.maxRetries;
        if (used >= budget) throw clientError;
        if (throttled) throttleRetries += 1;
        else transientRetries += 1;
        await this.dependencies.sleep(
          retryDelayMilliseconds(clientError.kind, used, this.dependencies.random),
        );
      }
    }
  }

  private async executeAttempt<T>(input: {
    document: string;
    variables?: Readonly<Record<string, unknown>>;
    signal?: AbortSignal;
  }): Promise<ShopifyGraphQlResult<T>> {
    const timeoutSignal = AbortSignal.timeout(this.configuration.timeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
    const token = await this.accessToken.getToken();
    const response = await this.dependencies.fetch(
      `https://${this.configuration.storeDomain}/admin/api/${this.configuration.apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query: input.document, variables: input.variables ?? {} }),
        signal,
      },
    );
    const requestId = response.headers.get("x-request-id");

    if (!response.ok) {
      throw new ShopifyClientError(
        statusKind(response.status),
        `Shopify returned HTTP ${response.status}`,
        isRetryableStatus(response.status),
        requestId,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ShopifyClientError(
        "malformed_response",
        "Shopify returned invalid JSON",
        false,
        requestId,
      );
    }
    const parsed = graphqlEnvelopeSchema.safeParse(body);
    if (!parsed.success || parsed.data.data === undefined) {
      throw new ShopifyClientError(
        "malformed_response",
        "Shopify response did not match the GraphQL envelope",
        false,
        requestId,
      );
    }
    if (parsed.data.errors && parsed.data.errors.length > 0) {
      // ShopifyQL reports its per-minute cost budget as a GraphQL-level error
      // on an HTTP 200 response; that is a retryable throttle, not a failure.
      const throttled = parsed.data.errors.some((graphqlError) =>
        /rate limited|throttled/i.test(graphqlError.message),
      );
      if (throttled) {
        throw new ShopifyClientError(
          "throttled",
          "Shopify rate limited the query",
          true,
          requestId,
        );
      }
      throw new ShopifyClientError("graphql", "Shopify GraphQL query failed", false, requestId);
    }

    return {
      data: parsed.data.data as T,
      requestId,
      throttleStatus: parsed.data.extensions?.cost?.throttleStatus ?? null,
    };
  }

  private toClientError(error: unknown, externalSignal?: AbortSignal): ShopifyClientError {
    if (error instanceof ShopifyClientError) return error;
    if (error instanceof DOMException && error.name === "AbortError") {
      return new ShopifyClientError(
        externalSignal?.aborted ? "cancelled" : "timeout",
        externalSignal?.aborted ? "Shopify request was cancelled" : "Shopify request timed out",
        !externalSignal?.aborted,
        null,
      );
    }
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return new ShopifyClientError("timeout", "Shopify request timed out", true, null);
    }
    return new ShopifyClientError("network", "Shopify network request failed", true, null);
  }
}

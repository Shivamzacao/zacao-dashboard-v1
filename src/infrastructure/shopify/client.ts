import { z } from "zod";

import { assertReadOnlyGraphQl } from "./admin-graphql/queries";
import type { ShopifyConfiguration } from "./config";

const graphqlEnvelopeSchema = z
  .object({
    data: z.unknown().optional(),
    errors: z
      .array(
        z
          .object({
            message: z.string(),
            extensions: z
              .object({
                code: z.string().optional(),
                cost: z
                  .object({
                    requestedQueryCost: z.number().optional(),
                    maximumAvailable: z.number().optional(),
                    currentlyAvailable: z.number().optional(),
                    windowResetAt: z.string().datetime({ offset: true }).optional(),
                  })
                  .passthrough()
                  .optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
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
    /**
     * When Shopify states when the throttled budget reopens (ShopifyQL reports
     * `extensions.cost.windowResetAt`), the instant to retry at. Null otherwise.
     */
    readonly retryAt: string | null = null,
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
  /** Epoch milliseconds; injected so throttle-window waits are testable. */
  readonly now: () => number;
  /**
   * Upper bound on the total time one request may spend waiting on throttling
   * before it fails as `throttled`. Bounded so a closed window can never hang a
   * page render indefinitely.
   */
  readonly maxThrottleWaitMs: number;
}

/**
 * Which Shopify budget a request draws on. `analytics` is ShopifyQL, whose
 * quota is separate from the Admin GraphQL leaky bucket.
 */
export type ShopifyRequestBudget = "admin" | "analytics";

export interface ShopifyClientAccessToken {
  readonly getToken: () => Promise<string>;
  readonly invalidate: () => void;
}

const defaultDependencies: ShopifyClientDependencies = {
  fetch,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random: Math.random,
  now: Date.now,
  maxThrottleWaitMs: 75_000,
};

/**
 * Backoff for failures that carry no provider-stated retry time: transient
 * network/server errors, and Admin GraphQL throttles (a leaky bucket that
 * restores continuously). Short, with jitter, so a fanned-out page does not
 * re-collide on the next wave.
 *
 * ShopifyQL throttles are different and are handled by the analytics window
 * below: verified live against the store (API 2026-07), the analytics budget is
 * a 1,000-point window that reopens on a minute boundary reported as
 * `extensions.cost.windowResetAt`, and each query is charged its *requested*
 * cost (up to 1,000). Retrying after a second or two only burns attempts.
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

/** Spread retries released by the same window reset so they do not collide. */
const WINDOW_RESET_JITTER_MS = 1_000;

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
  /**
   * Epoch ms until which the analytics (ShopifyQL) window is known to be
   * closed. Shared by every request on this client, so once one query learns
   * the window is exhausted the others wait instead of spending attempts.
   */
  private analyticsWindowClosedUntil = 0;

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
    budget?: ShopifyRequestBudget;
  }): Promise<ShopifyGraphQlResult<T>> {
    assertReadOnlyGraphQl(input.document);

    const analytics = input.budget === "analytics";
    let refreshedExpiredToken = false;
    let throttleRetries = 0;
    let transientRetries = 0;
    let throttleWaitedMs = 0;
    for (;;) {
      if (analytics) {
        // Another request already learned the window is closed; wait for it to
        // reopen rather than spending an attempt that is certain to fail.
        const wait = this.analyticsWindowClosedUntil - this.dependencies.now();
        if (wait > 0) {
          const delay = wait + Math.round(this.dependencies.random() * WINDOW_RESET_JITTER_MS);
          if (throttleWaitedMs + delay > this.dependencies.maxThrottleWaitMs) {
            throw new ShopifyClientError(
              "throttled",
              "Shopify analytics budget is exhausted for the current window",
              true,
              null,
              new Date(this.analyticsWindowClosedUntil).toISOString(),
            );
          }
          throttleWaitedMs += delay;
          await this.dependencies.sleep(delay);
        }
      }
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

        const resetAt = clientError.retryAt ? Date.parse(clientError.retryAt) : Number.NaN;
        if (throttled && Number.isFinite(resetAt)) {
          // Provider-stated window reset: record it for every request on this
          // client, then let the top of the loop do the (bounded) wait.
          this.analyticsWindowClosedUntil = Math.max(this.analyticsWindowClosedUntil, resetAt);
          if (!analytics) {
            const delay =
              Math.max(0, resetAt - this.dependencies.now()) +
              Math.round(this.dependencies.random() * WINDOW_RESET_JITTER_MS);
            if (throttleWaitedMs + delay > this.dependencies.maxThrottleWaitMs) throw clientError;
            throttleWaitedMs += delay;
            await this.dependencies.sleep(delay);
          }
          continue;
        }
        const delay = retryDelayMilliseconds(clientError.kind, used, this.dependencies.random);
        if (throttled) throttleWaitedMs += delay;
        await this.dependencies.sleep(delay);
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
      // ShopifyQL reports its analytics budget as a GraphQL-level error on an
      // HTTP 200 response (code THROTTLED, with the window reset instant);
      // that is a retryable throttle, not a failure.
      const throttleError = parsed.data.errors.find(
        (graphqlError) =>
          graphqlError.extensions?.code === "THROTTLED" ||
          /rate limited|throttled/i.test(graphqlError.message),
      );
      if (throttleError) {
        throw new ShopifyClientError(
          "throttled",
          "Shopify rate limited the query",
          true,
          requestId,
          throttleError.extensions?.cost?.windowResetAt ?? null,
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

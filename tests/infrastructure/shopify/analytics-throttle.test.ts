import { describe, expect, it, vi } from "vitest";

import { REQUIRED_SHOPIFY_READ_SCOPES, ShopifyGraphQlClient } from "@/src/infrastructure/shopify";
import { ShopifyQlAdapter } from "@/src/infrastructure/shopify/shopifyql/adapter";

const configuration = {
  storeDomain: "example-store.myshopify.com",
  apiVersion: "2026-07",
  grantedScopes: [...REQUIRED_SHOPIFY_READ_SCOPES],
  timeoutMs: 5_000,
  maxRetries: 2,
};
const token = { getToken: async () => "sanitized-test-token", invalidate: () => undefined };

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "x-request-id": "request-1" },
  });
}

/** Shape observed live on API 2026-07 for an exhausted ShopifyQL window. */
function throttled(windowResetAt: string, requestedQueryCost = 442): Response {
  return response({
    data: { shopifyqlQuery: null },
    errors: [
      {
        message: "Rate limited. Please retry later.",
        extensions: {
          code: "THROTTLED",
          cost: {
            requestedQueryCost,
            maximumAvailable: 1_000,
            currentlyAvailable: 14,
            windowResetAt,
          },
        },
      },
    ],
  });
}

const table = () =>
  response({
    data: {
      shopifyqlQuery: {
        parseErrors: [],
        tableData: { columns: [{ name: "orders", dataType: "INTEGER" }], rows: [{ orders: "3" }] },
      },
    },
  });

const T0 = Date.parse("2026-09-27T18:33:20Z");
const RESET = "2026-09-27T18:34:00+00:00";

describe("ShopifyQL analytics window throttling (C-1)", () => {
  it("waits for the provider-stated window reset instead of a short backoff", async () => {
    let clock = T0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(throttled(RESET))
      .mockImplementationOnce(async () => table());
    const client = new ShopifyGraphQlClient(configuration, token, {
      fetch: fetchMock,
      sleep,
      random: () => 0,
      now: () => clock,
    });

    const result = await new ShopifyQlAdapter(client).read({
      dataset: "sales_totals",
      dateRange: { startDate: "2026-09-01", endDate: "2026-09-27" },
    });

    expect(result.rows).toEqual([{ orders: "3" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 40 s until the minute boundary, zero jitter.
    expect(sleep).toHaveBeenCalledWith(40_000);
  });

  it("shares a closed window across requests so queued queries do not burn attempts", async () => {
    const clock = T0;
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => throttled(RESET));
    const client = new ShopifyGraphQlClient(configuration, token, {
      fetch: fetchMock,
      sleep,
      random: () => 0,
      now: () => clock,
      // Less than the 40 s to the reset, so the first request gives up at once.
      maxThrottleWaitMs: 10_000,
    });

    await expect(
      client.execute({ document: "query Q { shop { name } }", budget: "analytics" }),
    ).rejects.toMatchObject({ kind: "throttled" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The second analytics request knows the window is closed until the reset
    // and fails fast without spending a request against the exhausted budget.
    await expect(
      client.execute({ document: "query Q { shop { name } }", budget: "analytics" }),
    ).rejects.toMatchObject({ kind: "throttled", retryAt: "2026-09-27T18:34:00.000Z" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Admin (non-analytics) requests are not blocked by the analytics window.
    fetchMock.mockImplementationOnce(async () => response({ data: { shop: { name: "Zacao" } } }));
    await expect(client.execute({ document: "query Q { shop { name } }" })).resolves.toMatchObject({
      data: { shop: { name: "Zacao" } },
    });
  });

  it("fails explicitly as throttled once the bounded wait is exceeded", async () => {
    let clock = T0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      // The window keeps moving one minute ahead: never recoverable in budget.
      throttled(new Date(clock + 60_000).toISOString()),
    );
    const client = new ShopifyGraphQlClient(configuration, token, {
      fetch: fetchMock,
      sleep,
      random: () => 0,
      now: () => clock,
      maxThrottleWaitMs: 90_000,
    });

    await expect(
      client.execute({ document: "query Q { shop { name } }", budget: "analytics" }),
    ).rejects.toMatchObject({ kind: "throttled", retryable: true });
    const waited = sleep.mock.calls.reduce((total, [ms]) => total + ms, 0);
    expect(waited).toBeLessThanOrEqual(90_000);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("still uses the short backoff for Admin GraphQL throttles without a reset time", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          data: {},
          errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
        }),
      )
      .mockResolvedValueOnce(response({ data: { shop: { name: "Zacao" } } }));
    const client = new ShopifyGraphQlClient(configuration, token, {
      fetch: fetchMock,
      sleep,
      random: () => 0,
    });
    await expect(client.execute({ document: "query Q { shop { name } }" })).resolves.toMatchObject({
      data: { shop: { name: "Zacao" } },
    });
    expect(sleep).toHaveBeenCalledWith(500);
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  collectShopifyPages,
  REQUIRED_SHOPIFY_READ_SCOPES,
  ShopifyGraphQlClient,
} from "@/src/infrastructure/shopify";

const configuration = {
  storeDomain: "example-store.myshopify.com",
  adminAccessToken: "sanitized-test-token",
  apiVersion: "2026-07",
  grantedScopes: [...REQUIRED_SHOPIFY_READ_SCOPES],
  timeoutMs: 5_000,
  maxRetries: 2,
};

function response(body: unknown, status = 200, requestId = "request-1"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": requestId },
  });
}

describe("Shopify GraphQL client", () => {
  it("returns data, request ID, and observed throttle status", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        data: { shop: { name: "Zacao" } },
        extensions: {
          cost: {
            throttleStatus: {
              maximumAvailable: 2_000,
              currentlyAvailable: 1_990,
              restoreRate: 100,
            },
          },
        },
      }),
    );
    const client = new ShopifyGraphQlClient(configuration, {
      fetch: fetchMock,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      client.execute<{ shop: { name: string } }>({ document: "query Shop { shop { name } }" }),
    ).resolves.toEqual({
      data: { shop: { name: "Zacao" } },
      requestId: "request-1",
      throttleStatus: {
        maximumAvailable: 2_000,
        currentlyAvailable: 1_990,
        restoreRate: 100,
      },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("retries bounded throttle/server failures and never retries permission failures", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const retryingFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, 429))
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({ data: { shop: { name: "Zacao" } } }));
    const retryingClient = new ShopifyGraphQlClient(configuration, {
      fetch: retryingFetch,
      sleep,
    });
    await expect(
      retryingClient.execute({ document: "query Shop { shop { name } }" }),
    ).resolves.toMatchObject({ data: { shop: { name: "Zacao" } } });
    expect(retryingFetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);

    const forbiddenFetch = vi.fn<typeof fetch>().mockResolvedValue(response({}, 403));
    const forbiddenClient = new ShopifyGraphQlClient(configuration, {
      fetch: forbiddenFetch,
      sleep,
    });
    await expect(
      forbiddenClient.execute({ document: "query Shop { shop { name } }" }),
    ).rejects.toMatchObject({ kind: "permission", retryable: false });
    expect(forbiddenFetch).toHaveBeenCalledOnce();
  });

  it("maps malformed, GraphQL, timeout, and cancellation failures", async () => {
    const cases: Array<{ failure: unknown; expected: string }> = [
      { failure: new DOMException("timed out", "TimeoutError"), expected: "timeout" },
      { failure: new DOMException("aborted", "AbortError"), expected: "timeout" },
    ];
    for (const testCase of cases) {
      const client = new ShopifyGraphQlClient(
        { ...configuration, maxRetries: 0 },
        { fetch: vi.fn<typeof fetch>().mockRejectedValue(testCase.failure) },
      );
      await expect(
        client.execute({ document: "query Shop { shop { name } }" }),
      ).rejects.toMatchObject({ kind: testCase.expected });
    }

    const malformedClient = new ShopifyGraphQlClient(
      { ...configuration, maxRetries: 0 },
      { fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json")) },
    );
    await expect(
      malformedClient.execute({ document: "query Shop { shop { name } }" }),
    ).rejects.toMatchObject({ kind: "malformed_response" });

    const graphqlClient = new ShopifyGraphQlClient(
      { ...configuration, maxRetries: 0 },
      {
        fetch: vi
          .fn<typeof fetch>()
          .mockResolvedValue(response({ data: {}, errors: [{ message: "Denied" }] })),
      },
    );
    await expect(
      graphqlClient.execute({ document: "query Shop { shop { name } }" }),
    ).rejects.toMatchObject({ kind: "graphql" });

    const controller = new AbortController();
    controller.abort();
    const cancelledClient = new ShopifyGraphQlClient(
      { ...configuration, maxRetries: 0 },
      { fetch: vi.fn<typeof fetch>().mockRejectedValue(new DOMException("aborted", "AbortError")) },
    );
    await expect(
      cancelledClient.execute({
        document: "query Shop { shop { name } }",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ kind: "cancelled", retryable: false });
  });
});

describe("bounded Shopify cursor pagination", () => {
  it("collects pages and marks a hard-limit truncation", async () => {
    const complete = await collectShopifyPages({
      maxPages: 3,
      fetchPage: vi
        .fn()
        .mockResolvedValueOnce({
          nodes: [1],
          pageInfo: { hasNextPage: true, endCursor: "one" },
        })
        .mockResolvedValueOnce({
          nodes: [2],
          pageInfo: { hasNextPage: false, endCursor: null },
        }),
    });
    expect(complete).toEqual({ records: [1, 2], truncated: false, pagesRead: 2 });

    const truncated = await collectShopifyPages({
      maxPages: 1,
      fetchPage: vi.fn().mockResolvedValue({
        nodes: [1],
        pageInfo: { hasNextPage: true, endCursor: "one" },
      }),
    });
    expect(truncated).toEqual({ records: [1], truncated: true, pagesRead: 1 });
  });

  it("rejects repeated cursors and cancellation", async () => {
    await expect(
      collectShopifyPages({
        maxPages: 3,
        fetchPage: vi.fn().mockResolvedValue({
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: "same" },
        }),
      }),
    ).rejects.toThrow(/repeated cursor/);
    const controller = new AbortController();
    controller.abort();
    await expect(
      collectShopifyPages({ maxPages: 1, signal: controller.signal, fetchPage: vi.fn() }),
    ).rejects.toThrow(DOMException);
  });
});

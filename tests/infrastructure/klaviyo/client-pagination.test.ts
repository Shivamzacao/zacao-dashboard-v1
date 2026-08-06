import { describe, expect, it, vi } from "vitest";

import {
  assertKlaviyoReadRequest,
  collectKlaviyoPages,
  KlaviyoClient,
  REQUIRED_KLAVIYO_READ_SCOPES,
} from "@/src/infrastructure/klaviyo";

const configuration = {
  privateApiKey: "sanitized-test-key",
  apiRevision: "2026-07-15",
  grantedScopes: [...REQUIRED_KLAVIYO_READ_SCOPES],
  reportingTimeZone: "America/New_York" as const,
  timeoutMs: 5_000,
  maxRetries: 2,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "x-request-id": "request-1", "ratelimit-remaining": "42" },
  });
}

describe("Klaviyo read client", () => {
  it("returns request/rate metadata without exposing the key in output", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(response({ data: [] })));
    const client = new KlaviyoClient(configuration, { fetch: fetchMock });
    await expect(client.get("/api/metrics")).resolves.toEqual({
      body: { data: [] },
      requestId: "request-1",
      rateLimitRemaining: 42,
    });
    expect(JSON.stringify((await client.get("/api/metrics")).body)).not.toContain(
      configuration.privateApiKey,
    );
  });

  it("permits POST only for audited read/report resources", () => {
    expect(() => assertKlaviyoReadRequest("POST", "/api/metric-aggregates")).not.toThrow();
    expect(() => assertKlaviyoReadRequest("POST", "/api/events")).toThrow(/only for audited/);
    expect(() => assertKlaviyoReadRequest("PATCH", "/api/flows/1")).toThrow(/read requests only/);
    expect(() => assertKlaviyoReadRequest("GET", "https://example.com/api/metrics")).toThrow(
      /outside/,
    );
  });

  it("retries throttling/server failures and does not retry permissions", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const retryFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, 429))
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({ data: [] }));
    const client = new KlaviyoClient(configuration, { fetch: retryFetch, sleep });
    await expect(client.get("/api/metrics")).resolves.toMatchObject({ body: { data: [] } });
    expect(retryFetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);

    const permissionFetch = vi.fn<typeof fetch>().mockResolvedValue(response({}, 403));
    const permissionClient = new KlaviyoClient(configuration, {
      fetch: permissionFetch,
      sleep,
    });
    await expect(permissionClient.get("/api/metrics")).rejects.toMatchObject({
      kind: "permission",
      retryable: false,
    });
    expect(permissionFetch).toHaveBeenCalledOnce();
  });

  it("maps malformed JSON, timeout, and cancellation", async () => {
    const malformed = new KlaviyoClient(
      { ...configuration, maxRetries: 0 },
      { fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("bad-json")) },
    );
    await expect(malformed.get("/api/metrics")).rejects.toMatchObject({
      kind: "malformed_response",
    });

    const timeout = new KlaviyoClient(
      { ...configuration, maxRetries: 0 },
      {
        fetch: vi.fn<typeof fetch>().mockRejectedValue(new DOMException("timeout", "TimeoutError")),
      },
    );
    await expect(timeout.get("/api/metrics")).rejects.toMatchObject({ kind: "timeout" });

    const controller = new AbortController();
    controller.abort();
    const cancelled = new KlaviyoClient(
      { ...configuration, maxRetries: 0 },
      { fetch: vi.fn<typeof fetch>().mockRejectedValue(new DOMException("abort", "AbortError")) },
    );
    await expect(cancelled.get("/api/metrics", controller.signal)).rejects.toMatchObject({
      kind: "cancelled",
      retryable: false,
    });
  });
});

describe("Klaviyo bounded pagination", () => {
  it("discovers newly returned resources across pages", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          data: [{ id: "flow-1" }],
          links: { next: "https://a.klaviyo.com/api/flows?page[cursor]=next" },
        }),
      )
      .mockResolvedValueOnce(response({ data: [{ id: "flow-2" }], links: { next: null } }));
    const client = new KlaviyoClient(configuration, { fetch: fetchMock });
    await expect(
      collectKlaviyoPages({ client, initialPath: "/api/flows", maxPages: 3 }),
    ).resolves.toEqual({
      records: [{ id: "flow-1" }, { id: "flow-2" }],
      truncated: false,
      pagesRead: 2,
    });
  });

  it("marks hard-limit truncation and rejects repeated links", async () => {
    const firstPage = response({
      data: [],
      links: { next: "https://a.klaviyo.com/api/flows?page[cursor]=same" },
    });
    const truncated = new KlaviyoClient(configuration, {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(firstPage),
    });
    await expect(
      collectKlaviyoPages({ client: truncated, initialPath: "/api/flows", maxPages: 1 }),
    ).resolves.toMatchObject({ truncated: true, pagesRead: 1 });

    const repeated = new KlaviyoClient(configuration, {
      fetch: vi.fn<typeof fetch>().mockImplementation(() =>
        Promise.resolve(
          response({
            data: [],
            links: { next: "https://a.klaviyo.com/api/flows?page[cursor]=same" },
          }),
        ),
      ),
    });
    await expect(
      collectKlaviyoPages({
        client: repeated,
        initialPath: "/api/flows?page[cursor]=same",
        maxPages: 3,
      }),
    ).rejects.toThrow(/repeated/);
  });
});

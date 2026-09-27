import { describe, expect, it, vi } from "vitest";

import { KlaviyoClient, REQUIRED_KLAVIYO_READ_SCOPES } from "@/src/infrastructure/klaviyo";

const configuration = {
  privateApiKey: "sanitized-test-key",
  apiRevision: "2026-07-15",
  grantedScopes: [...REQUIRED_KLAVIYO_READ_SCOPES],
  reportingTimeZone: "America/New_York" as const,
  timeoutMs: 5_000,
  maxRetries: 2,
};

const ok = () =>
  new Response(JSON.stringify({ data: { attributes: { results: [] } } }), {
    status: 200,
    headers: { "content-type": "application/vnd.api+json" },
  });

/** Headers observed live on a values-report response (2026-09-28). */
const throttled = (headers: Record<string, string>) =>
  new Response(JSON.stringify({ errors: [{ status: 429 }] }), {
    status: 429,
    headers: { "content-type": "application/vnd.api+json", ...headers },
  });

function harness(responses: (() => Response)[], overrides: Record<string, unknown> = {}) {
  let clock = 1_000_000;
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) fetchMock.mockImplementationOnce(async () => response());
  const client = new KlaviyoClient(configuration, {
    fetch: fetchMock,
    sleep,
    now: () => clock,
    random: () => 0,
    ...overrides,
  });
  return { client, fetchMock, sleep };
}

describe("Klaviyo rate limiting (F-K3, verified live)", () => {
  it("waits for Retry-After on 429 instead of a 100 ms retry", async () => {
    const { client, sleep, fetchMock } = harness([
      () => throttled({ "retry-after": "31", "ratelimit-limit": "1, 1;w=1, 2;w=60, 225;w=86400" }),
      ok,
    ]);
    await client.postReport("/api/flow-values-reports", {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(31_000);
  });

  it("falls back to RateLimit-Reset when Retry-After is absent", async () => {
    const { client, sleep } = harness([() => throttled({ "ratelimit-reset": "12" }), ok]);
    await client.get("/api/flows");
    expect(sleep).toHaveBeenCalledWith(12_000);
  });

  it("fails explicitly as throttled when the reset exceeds the wait bound", async () => {
    const { client, fetchMock } = harness([() => throttled({ "retry-after": "600" })], {
      maxThrottleWaitMs: 65_000,
    });
    await expect(client.postReport("/api/campaign-values-reports", {})).rejects.toMatchObject({
      kind: "throttled",
      retryAfterMs: 600_000,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("serializes and spaces values-report requests to the 1/s burst limit", async () => {
    const { client, sleep, fetchMock } = harness([ok, ok]);
    await Promise.all([
      client.postReport("/api/campaign-values-reports", {}),
      client.postReport("/api/flow-values-reports", {}),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_100);
  });

  it("does not space metric-aggregate requests (separate, larger budget)", async () => {
    const { client, sleep } = harness([ok, ok]);
    await client.postReport("/api/metric-aggregates", {});
    await client.postReport("/api/metric-aggregates", {});
    expect(sleep).not.toHaveBeenCalled();
  });
});

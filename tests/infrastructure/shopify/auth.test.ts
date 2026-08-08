import { describe, expect, it, vi } from "vitest";

import {
  createShopifyAccessTokenProvider,
  ShopifyGraphQlClient,
} from "@/src/infrastructure/shopify";
import { REQUIRED_SHOPIFY_READ_SCOPES } from "@/src/infrastructure/shopify";

const credential = { clientId: "sanitized-client-id", clientSecret: "sanitized-secret" };

function tokenResponse(token: string, expiresIn = 86_399): Response {
  return new Response(
    JSON.stringify({
      access_token: token,
      expires_in: expiresIn,
      scope: "read_orders,read_products",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("Shopify client-credentials access token provider", () => {
  it("mints once and serves the cached token until near expiry", async () => {
    let currentTime = 0;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse("token-one", 3_600))
      .mockResolvedValueOnce(tokenResponse("token-two", 3_600));
    const provider = createShopifyAccessTokenProvider({
      storeDomain: "example-store.myshopify.com",
      credential,
      fetchImplementation: fetchMock,
      now: () => currentTime,
    });

    await expect(provider.getToken()).resolves.toBe("token-one");
    await expect(provider.getToken()).resolves.toBe("token-one");
    expect(fetchMock).toHaveBeenCalledOnce();

    // Advance past the 120s expiry margin boundary.
    currentTime = 3_600_000 - 100_000;
    await expect(provider.getToken()).resolves.toBe("token-two");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent mints and exposes granted scopes", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(tokenResponse("token-one"));
    const provider = createShopifyAccessTokenProvider({
      storeDomain: "example-store.myshopify.com",
      credential,
      fetchImplementation: fetchMock,
      now: () => 0,
    });
    const [first, second, scopes] = await Promise.all([
      provider.getToken(),
      provider.getToken(),
      provider.getGrantedScopes(),
    ]);
    expect(first).toBe("token-one");
    expect(second).toBe("token-one");
    expect(scopes).toEqual(["read_orders", "read_products"]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("re-mints after invalidate and never leaks the secret in failures", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse("token-one"))
      .mockResolvedValueOnce(tokenResponse("token-two"));
    const provider = createShopifyAccessTokenProvider({
      storeDomain: "example-store.myshopify.com",
      credential,
      fetchImplementation: fetchMock,
      now: () => 0,
    });
    await expect(provider.getToken()).resolves.toBe("token-one");
    provider.invalidate();
    await expect(provider.getToken()).resolves.toBe("token-two");

    const failingProvider = createShopifyAccessTokenProvider({
      storeDomain: "example-store.myshopify.com",
      credential,
      fetchImplementation: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("", { status: 401 })),
      now: () => 0,
    });
    const failure = await failingProvider.getToken().catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/HTTP 401/);
    expect((failure as Error).message).not.toContain("sanitized-secret");
  });
});

describe("Shopify client authentication recovery", () => {
  it("invalidates and re-mints exactly once on an authentication failure", async () => {
    const configuration = {
      storeDomain: "example-store.myshopify.com",
      apiVersion: "2026-07",
      grantedScopes: [...REQUIRED_SHOPIFY_READ_SCOPES],
      timeoutMs: 5_000,
      maxRetries: 0,
    };
    const invalidate = vi.fn();
    const tokens = ["expired-token", "fresh-token"];
    const accessToken = {
      getToken: async () => tokens.shift() ?? "fresh-token",
      invalidate,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { shop: { name: "Zacao" } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const client = new ShopifyGraphQlClient(configuration, accessToken, {
      fetch: fetchMock,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      client.execute({ document: "query Shop { shop { name } }" }),
    ).resolves.toMatchObject({ data: { shop: { name: "Zacao" } } });
    expect(invalidate).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // A second authentication failure is terminal.
    const alwaysUnauthorized = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 401 }));
    const failingClient = new ShopifyGraphQlClient(configuration, accessToken, {
      fetch: alwaysUnauthorized,
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    await expect(
      failingClient.execute({ document: "query Shop { shop { name } }" }),
    ).rejects.toMatchObject({ kind: "authentication" });
    expect(alwaysUnauthorized).toHaveBeenCalledTimes(2);
  });
});

import { z } from "zod";

export const shopifyCredentialSchema = z
  .object({
    clientId: z.string().trim().min(8),
    clientSecret: z.string().trim().min(8),
  })
  .strict();

export type ShopifyCredential = z.infer<typeof shopifyCredentialSchema>;

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(8),
    expires_in: z.number().int().positive(),
    scope: z.string(),
  })
  .passthrough();

export interface ShopifyAccessTokenProvider {
  readonly getToken: () => Promise<string>;
  readonly getGrantedScopes: () => Promise<readonly string[]>;
  readonly invalidate: () => void;
}

const EXPIRY_MARGIN_MS = 120_000;

/**
 * Mints short-lived Admin API access tokens through the Dev Dashboard
 * client-credentials grant and caches them until shortly before expiry.
 */
export function createShopifyAccessTokenProvider(input: {
  storeDomain: string;
  credential: ShopifyCredential;
  fetchImplementation?: typeof fetch;
  now?: () => number;
}): ShopifyAccessTokenProvider {
  const credential = shopifyCredentialSchema.parse(input.credential);
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const now = input.now ?? Date.now;

  let cached: { token: string; scopes: readonly string[]; expiresAtMs: number } | null = null;
  let inFlight: Promise<{
    token: string;
    scopes: readonly string[];
    expiresAtMs: number;
  }> | null = null;

  async function mint() {
    const response = await fetchImplementation(
      `https://${input.storeDomain}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: credential.clientId,
          client_secret: credential.clientSecret,
          grant_type: "client_credentials",
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Shopify token mint failed with HTTP ${response.status}`);
    }
    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("Shopify token mint returned an unexpected response shape");
    }
    return {
      token: parsed.data.access_token,
      scopes: parsed.data.scope
        .split(",")
        .map((scope) => scope.trim())
        .filter((scope) => scope !== ""),
      expiresAtMs: now() + parsed.data.expires_in * 1000 - EXPIRY_MARGIN_MS,
    };
  }

  async function current() {
    if (cached && now() < cached.expiresAtMs) return cached;
    inFlight ??= mint().finally(() => {
      inFlight = null;
    });
    cached = await inFlight;
    return cached;
  }

  return {
    getToken: async () => (await current()).token,
    getGrantedScopes: async () => (await current()).scopes,
    invalidate: () => {
      cached = null;
    },
  };
}

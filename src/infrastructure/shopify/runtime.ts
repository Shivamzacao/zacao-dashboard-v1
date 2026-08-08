import "server-only";

import { z } from "zod";

import {
  createShopifyAccessTokenProvider,
  shopifyCredentialSchema,
  type ShopifyAccessTokenProvider,
} from "./auth";
import {
  assertReadOnlyScopes,
  parseShopifyConfiguration,
  type ShopifyConfiguration,
} from "./config";

const shopifyRuntimeSettingsSchema = z
  .object({
    storeDomain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
    apiVersion: z.string().regex(/^20\d{2}-(01|04|07|10)$/),
    credential: shopifyCredentialSchema,
  })
  .strict();

export type ShopifyRuntimeSettings = z.infer<typeof shopifyRuntimeSettingsSchema>;

export interface ShopifyRuntime {
  readonly configuration: ShopifyConfiguration;
  readonly accessToken: ShopifyAccessTokenProvider;
}

export function loadShopifyRuntimeSettingsOrNull(): ShopifyRuntimeSettings | null {
  const values = {
    storeDomain: process.env["SHOPIFY_SHOP_DOMAIN"],
    clientId: process.env["SHOPIFY_CLIENT_ID"],
    clientSecret: process.env["SHOPIFY_CLIENT_SECRET"],
    apiVersion: process.env["SHOPIFY_ADMIN_API_VERSION"],
  };
  if (Object.values(values).every((value) => value === undefined || value === "")) return null;
  return shopifyRuntimeSettingsSchema.parse({
    storeDomain: values.storeDomain,
    apiVersion: values.apiVersion,
    credential: { clientId: values.clientId, clientSecret: values.clientSecret },
  });
}

/**
 * Builds the validated Shopify runtime: mints a token, discovers the actually
 * granted scopes, and refuses to start unless every required read-only scope
 * is present and no write scope was granted.
 */
export async function createShopifyRuntime(
  settings: ShopifyRuntimeSettings,
  dependencies: { fetchImplementation?: typeof fetch; now?: () => number } = {},
): Promise<ShopifyRuntime> {
  const accessToken = createShopifyAccessTokenProvider({
    storeDomain: settings.storeDomain,
    credential: settings.credential,
    ...(dependencies.fetchImplementation
      ? { fetchImplementation: dependencies.fetchImplementation }
      : {}),
    ...(dependencies.now ? { now: dependencies.now } : {}),
  });
  const grantedScopes = await accessToken.getGrantedScopes();
  assertReadOnlyScopes(grantedScopes);
  const configuration = parseShopifyConfiguration({
    storeDomain: settings.storeDomain,
    apiVersion: settings.apiVersion,
    grantedScopes: [...grantedScopes],
    timeoutMs: 15_000,
    maxRetries: 2,
  });
  return { configuration, accessToken };
}

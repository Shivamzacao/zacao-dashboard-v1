import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadKlaviyoConfigurationOrNull } from "@/src/infrastructure/klaviyo/runtime";
import { loadShopifyRuntimeSettingsOrNull } from "@/src/infrastructure/shopify/runtime";

const MANAGED_KEYS = [
  "SHOPIFY_SHOP_DOMAIN",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "SHOPIFY_ADMIN_API_VERSION",
  "KLAVIYO_PRIVATE_API_KEY",
  "KLAVIYO_API_REVISION",
  "KLAVIYO_CONVERSION_METRIC_ID",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(MANAGED_KEYS.map((key) => [key, process.env[key]]));
  for (const key of MANAGED_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("Shopify runtime settings loader", () => {
  it("returns null when no Shopify variables are configured", () => {
    expect(loadShopifyRuntimeSettingsOrNull()).toBeNull();
  });

  it("parses complete settings and rejects partial or malformed ones", () => {
    process.env["SHOPIFY_SHOP_DOMAIN"] = "example-store.myshopify.com";
    process.env["SHOPIFY_CLIENT_ID"] = "sanitized-client-id";
    process.env["SHOPIFY_CLIENT_SECRET"] = "sanitized-secret";
    process.env["SHOPIFY_ADMIN_API_VERSION"] = "2026-07";
    expect(loadShopifyRuntimeSettingsOrNull()).toEqual({
      storeDomain: "example-store.myshopify.com",
      apiVersion: "2026-07",
      credential: { clientId: "sanitized-client-id", clientSecret: "sanitized-secret" },
    });

    delete process.env["SHOPIFY_CLIENT_SECRET"];
    expect(() => loadShopifyRuntimeSettingsOrNull()).toThrow();

    process.env["SHOPIFY_CLIENT_SECRET"] = "sanitized-secret";
    process.env["SHOPIFY_SHOP_DOMAIN"] = "not-a-shopify-domain.com";
    expect(() => loadShopifyRuntimeSettingsOrNull()).toThrow();
  });
});

describe("Klaviyo configuration loader", () => {
  it("returns null when no Klaviyo variables are configured", () => {
    expect(loadKlaviyoConfigurationOrNull()).toBeNull();
  });

  it("parses a complete configuration with required read scopes", () => {
    process.env["KLAVIYO_PRIVATE_API_KEY"] = "sanitized-klaviyo-key";
    process.env["KLAVIYO_API_REVISION"] = "2026-07-15";
    const configuration = loadKlaviyoConfigurationOrNull();
    expect(configuration).toMatchObject({
      privateApiKey: "sanitized-klaviyo-key",
      apiRevision: "2026-07-15",
      reportingTimeZone: "America/New_York",
    });
    expect(configuration?.grantedScopes).toContain("metrics:read");
  });

  it("rejects a conversion metric ID that contradicts the frozen registry", () => {
    process.env["KLAVIYO_PRIVATE_API_KEY"] = "sanitized-klaviyo-key";
    process.env["KLAVIYO_API_REVISION"] = "2026-07-15";
    process.env["KLAVIYO_CONVERSION_METRIC_ID"] = "WRONG99";
    expect(() => loadKlaviyoConfigurationOrNull()).toThrow(/placed_order/);

    process.env["KLAVIYO_CONVERSION_METRIC_ID"] = "Rt8Ckz";
    expect(loadKlaviyoConfigurationOrNull()).not.toBeNull();
  });

  it("rejects a malformed API revision", () => {
    process.env["KLAVIYO_PRIVATE_API_KEY"] = "sanitized-klaviyo-key";
    process.env["KLAVIYO_API_REVISION"] = "july-2026";
    expect(() => loadKlaviyoConfigurationOrNull()).toThrow();
  });
});

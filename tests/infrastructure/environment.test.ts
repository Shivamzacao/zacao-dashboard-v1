import { describe, expect, it } from "vitest";

import {
  parseServerEnvironment,
  serverEnvironmentSchema,
} from "@/src/infrastructure/config/environment-schema";

describe("server environment contract", () => {
  it("accepts the locked non-secret reporting configuration", () => {
    expect(
      parseServerEnvironment({
        NODE_ENV: "test",
        REPORTING_TIMEZONE: "America/New_York",
        REPORTING_CURRENCY: "USD",
      }),
    ).toEqual({
      NODE_ENV: "test",
      REPORTING_TIMEZONE: "America/New_York",
      REPORTING_CURRENCY: "USD",
    });
  });

  it("fails fast for missing values, invalid timezone, non-USD currency, and unknown fields", () => {
    expect(() => parseServerEnvironment({})).toThrow();
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "test",
        REPORTING_TIMEZONE: "Invalid/Timezone",
        REPORTING_CURRENCY: "USD",
      }),
    ).toThrow();
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "test",
        REPORTING_TIMEZONE: "America/New_York",
        REPORTING_CURRENCY: "EUR",
      }),
    ).toThrow();
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "test",
        REPORTING_TIMEZONE: "America/New_York",
        REPORTING_CURRENCY: "USD",
        SHOPIFY_ADMIN_ACCESS_TOKEN: "must-not-be-part-of-base-contract",
      }),
    ).toThrow();
  });

  it("contains no client-prefixed or provider-secret keys", () => {
    const keys = serverEnvironmentSchema.keyof().options;
    expect(keys.some((key) => key.startsWith("NEXT_PUBLIC_"))).toBe(false);
    expect(keys.some((key) => /TOKEN|KEY|SECRET|PASSWORD/.test(key))).toBe(false);
  });
});

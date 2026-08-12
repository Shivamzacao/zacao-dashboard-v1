import { describe, expect, it } from "vitest";

import {
  ADMIN_READ_QUERIES,
  assertReadOnlyGraphQl,
  assertReadOnlyScopes,
  buildShopifyQlQuery,
  parseShopifyConfiguration,
  REQUIRED_SHOPIFY_READ_SCOPES,
  SHOPIFYQL_QUERY,
} from "@/src/infrastructure/shopify";

const validConfiguration = {
  storeDomain: "example-store.myshopify.com",
  apiVersion: "2026-07",
  grantedScopes: [...REQUIRED_SHOPIFY_READ_SCOPES],
  timeoutMs: 5_000,
  maxRetries: 2,
};

describe("Shopify read-only configuration", () => {
  it("accepts the audited least-privilege read scope set", () => {
    expect(parseShopifyConfiguration(validConfiguration)).toEqual(validConfiguration);
  });

  it("rejects missing scopes, write scopes, invalid stores, and unbounded retries", () => {
    expect(() =>
      parseShopifyConfiguration({ ...validConfiguration, grantedScopes: ["read_orders"] }),
    ).toThrow(/Missing required/);
    expect(() => assertReadOnlyScopes(["read_orders", "write_orders"])).toThrow(/read-only/);
    expect(() =>
      parseShopifyConfiguration({ ...validConfiguration, storeDomain: "example.com" }),
    ).toThrow();
    expect(() => parseShopifyConfiguration({ ...validConfiguration, maxRetries: 3 })).toThrow();
  });
});

describe("Shopify query allowlist", () => {
  it("builds only the audited ShopifyQL datasets with bounded date input", () => {
    expect(
      buildShopifyQlQuery({
        dataset: "sales_trend",
        dateRange: { startDate: "2025-08-01", endDate: "2026-08-01" },
        grain: "month",
      }),
    ).toBe(
      "FROM sales SHOW orders, gross_sales, discounts, returns, net_sales, shipping_charges, taxes, total_sales, average_order_value TIMESERIES month SINCE 2025-08-01 UNTIL 2026-08-01",
    );
    expect(
      buildShopifyQlQuery({
        dataset: "product_line_classification",
        dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      }),
    ).toContain("GROUP BY line_type, product_title, product_variant_title, product_variant_sku");
    expect(
      buildShopifyQlQuery({
        dataset: "native_channels",
        dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      }),
    ).toContain("SHOW orders, net_sales, total_sales, average_order_value GROUP BY sales_channel");
    expect(
      buildShopifyQlQuery({
        dataset: "session_engagement",
        dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      }),
    ).toContain("SHOW average_session_duration");
    expect(
      buildShopifyQlQuery({
        dataset: "billing_city",
        dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      }),
    ).toContain(
      "SHOW customers WHERE billing_city IS NOT NULL GROUP BY billing_city, billing_region",
    );
    expect(
      buildShopifyQlQuery({
        dataset: "traffic_attribution",
        dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      }),
    ).toBe(
      "FROM sessions SHOW sessions WHERE human_or_bot_session = 'human' GROUP BY referrer_source SINCE 2026-01-01 UNTIL 2026-01-31 ORDER BY sessions DESC LIMIT 50",
    );
    expect(
      buildShopifyQlQuery({
        dataset: "affiliate_sessions",
        dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      }),
    ).toContain("GROUP BY utm_source, utm_campaign, utm_content");
    expect(
      buildShopifyQlQuery({
        dataset: "affiliate_sales",
        dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      }),
    ).toContain("WHERE discount_code IS NOT NULL GROUP BY discount_code");
    expect(() =>
      buildShopifyQlQuery({
        dataset: "sales_trend",
        dateRange: { startDate: "2026-02-01", endDate: "2026-01-01" },
      }),
    ).toThrow();
  });

  it("contains query operations only and rejects mutations statically at runtime", () => {
    for (const document of [...ADMIN_READ_QUERIES, SHOPIFYQL_QUERY]) {
      expect(() => assertReadOnlyGraphQl(document)).not.toThrow();
      expect(document).not.toMatch(/\bmutation\b/i);
    }
    expect(() => assertReadOnlyGraphQl("mutation ChangeProduct { productUpdate {} }")).toThrow(
      /query operations only/,
    );
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  createBackendApiRuntime,
  LIVE_DASHBOARD_SECTION_PLAN,
  LiveBackendApiRuntime,
} from "@/src/infrastructure/api/live-runtime";

const filters = {
  startDate: "2025-08-08",
  endDate: "2026-08-07",
  channels: [] as string[],
  productSkus: [] as string[],
  locations: [] as string[],
};

const shopifySettings = {
  storeDomain: "example-store.myshopify.com",
  apiVersion: "2026-07",
  credential: { clientId: "sanitized-client-id", clientSecret: "sanitized-secret" },
};

const klaviyoConfiguration = {
  privateApiKey: "sanitized-klaviyo-key",
  apiRevision: "2026-07-15",
  grantedScopes: ["accounts:read", "campaigns:read", "events:read", "flows:read", "metrics:read"],
  reportingTimeZone: "America/New_York" as const,
  timeoutMs: 5_000,
  maxRetries: 0,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const shopifyqlPayloads: Record<string, unknown> = {
  new_returning_customers: {
    columns: [
      { name: "new_or_returning_customer", dataType: "STRING" },
      { name: "orders", dataType: "INTEGER" },
      { name: "customers", dataType: "INTEGER" },
    ],
    rows: [
      { new_or_returning_customer: "New", orders: "120", customers: "300" },
      { new_or_returning_customer: "Returning", orders: "54", customers: "100" },
    ],
  },
  "FROM sessions": {
    columns: [],
    rows: [
      {
        month: "2026-07-01",
        sessions: "240",
        online_store_visitors: "197",
        sessions_with_cart_additions: "10",
        sessions_that_reached_checkout: "9",
        sessions_that_completed_checkout: "4",
        conversion_rate: "0.0166",
      },
    ],
  },
};

const defaultProductLineRows = [
  {
    line_type: "product",
    product_title: "70% Cacao Dark Chocolate",
    product_variant_title: "10-Pack",
    product_variant_sku: "ZAC-DC-70-10PK",
    net_sales: "6761.32",
    orders: "77",
    net_items_sold: "665",
  },
];

/**
 * A stub Shopify + Klaviyo backend: token minting, ShopifyQL, admin GraphQL,
 * and empty-account Klaviyo endpoints, keyed off the request URL/body.
 */
function stubFetch(
  overrides: {
    failFunnel?: boolean;
    productLineRows?: readonly Record<string, string>[];
  } = {},
) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";

    if (url.endsWith("/admin/oauth/access_token")) {
      return json({
        access_token: "shpat_sanitized",
        expires_in: 86_399,
        scope:
          "read_all_orders,read_analytics,read_customers,read_inventory,read_locations,read_orders,read_products,read_reports",
      });
    }
    if (url.includes("/admin/api/")) {
      if (body.includes("shopifyqlQuery")) {
        if (body.includes("average_session_duration")) {
          return json({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: {
                  columns: [],
                  rows: [{ average_session_duration: "192" }],
                },
              },
            },
          });
        }
        if (body.includes("GROUP BY referrer_source")) {
          return json({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: {
                  columns: [],
                  rows: [
                    { referrer_source: "Social", sessions: "240" },
                    { referrer_source: "Search", sessions: "160" },
                  ],
                },
              },
            },
          });
        }
        if (body.includes("FROM sessions")) {
          if (overrides.failFunnel) return json({}, 500);
          return json({
            data: {
              shopifyqlQuery: { parseErrors: [], tableData: shopifyqlPayloads["FROM sessions"] },
            },
          });
        }
        if (body.includes("new_or_returning_customer")) {
          return json({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: shopifyqlPayloads["new_returning_customers"],
              },
            },
          });
        }
        if (body.includes("gross_sales") && body.includes("average_order_value")) {
          const salesRow = {
            orders: "174",
            gross_sales: "85010.75",
            discounts: "-12110.5",
            returns: "0",
            net_sales: "16153.54",
            shipping_charges: "0",
            taxes: "3.2",
            total_sales: "16156.74",
            average_order_value: "114.241",
          };
          const timeseries = body.includes("TIMESERIES");
          return json({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: {
                  columns: [],
                  rows: timeseries ? [{ month: "2026-07-01", ...salesRow }] : [salesRow],
                },
              },
            },
          });
        }
        if (body.includes("day_of_week")) {
          return json({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: {
                  columns: [],
                  rows: [{ day_of_week: "Friday", hour_of_day: "13", orders: "6" }],
                },
              },
            },
          });
        }
        if (body.includes("sales_channel")) {
          return json({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: {
                  columns: [],
                  rows: [
                    {
                      sales_channel: "Online Store",
                      orders: "170",
                      net_sales: "16000.00",
                      total_sales: "16003.20",
                      average_order_value: "94.12",
                    },
                    {
                      sales_channel: null,
                      orders: "4",
                      net_sales: "153.54",
                      total_sales: "153.54",
                      average_order_value: "38.385",
                    },
                  ],
                },
              },
            },
          });
        }
        if (body.includes("orders_fulfilled")) {
          return json({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: {
                  columns: [],
                  rows: [
                    {
                      month: "2026-07-01",
                      orders_fulfilled: "160",
                      orders_shipped: "158",
                      orders_delivered: "120",
                    },
                  ],
                },
              },
            },
          });
        }
        if (body.includes("billing_country")) {
          return json({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: {
                  columns: [],
                  rows: [
                    {
                      billing_country: "United States",
                      billing_region: "New York",
                      orders: "80",
                      total_sales: "9000.10",
                    },
                  ],
                },
              },
            },
          });
        }
        if (body.includes("billing_city")) {
          return json({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: {
                  columns: [],
                  rows: [{ billing_city: "New York", billing_region: "NY", customers: "38" }],
                },
              },
            },
          });
        }
        return json({
          data: {
            shopifyqlQuery: {
              parseErrors: [],
              tableData: {
                columns: [],
                rows: overrides.productLineRows ?? defaultProductLineRows,
              },
            },
          },
        });
      }
      if (body.includes("CurrentShop")) {
        return json({
          data: {
            shop: {
              name: "Zacao",
              currencyCode: "USD",
              ianaTimezone: "America/New_York",
              plan: { displayName: "Basic" },
            },
          },
        });
      }
      if (body.includes("CurrentProducts")) {
        return json({
          data: {
            products: {
              nodes: [
                {
                  id: "gid://shopify/Product/1",
                  title: "70% Cacao Dark Chocolate",
                  handle: "70-cacao",
                  status: "ACTIVE",
                  variants: {
                    nodes: [
                      {
                        id: "gid://shopify/ProductVariant/11",
                        title: "10-Pack",
                        sku: "ZAC-DC-70-10PK",
                        price: "54.99",
                        inventoryQuantity: 120,
                        sellableOnlineQuantity: 118,
                        inventoryItem: {
                          id: "gid://shopify/InventoryItem/21",
                          sku: "ZAC-DC-70-10PK",
                          tracked: true,
                          unitCost: null,
                          inventoryLevels: {
                            nodes: [
                              {
                                id: "gid://shopify/InventoryLevel/31",
                                updatedAt: "2026-08-01T00:00:00Z",
                                location: {
                                  id: "gid://shopify/Location/41",
                                  name: "SNAPL",
                                  isActive: true,
                                },
                                quantities: [{ name: "available", quantity: 100 }],
                              },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        });
      }
      return json({ data: {} });
    }

    if (url.includes("a.klaviyo.com")) {
      if (url.includes("/api/accounts")) {
        return json({
          data: [
            {
              id: "RcDBg3",
              type: "account",
              attributes: {
                timezone: "Europe/Madrid",
                preferred_currency: "USD",
                locale: "en-US",
                test_account: false,
              },
            },
          ],
        });
      }
      if (url.includes("/api/events")) return json({ data: [] });
      if (url.includes("/api/campaigns") || url.includes("/api/flows")) {
        return json({ data: [], links: { next: null } });
      }
      if (url.includes("values-reports")) {
        return json({ data: { attributes: { results: [] } } });
      }
      if (url.includes("metric-aggregates")) {
        return json({ data: { attributes: { dates: [], data: [] } } });
      }
    }
    return json({}, 404);
  });
}

function metricByKey(page: { metrics: readonly { key: string }[] }, key: string) {
  const metric = page.metrics.find((entry) => entry.key === key);
  if (!metric) throw new Error(`Metric missing from page: ${key}`);
  return metric as {
    key: string;
    value: unknown;
    readiness: { state: string; warningCodes: readonly string[] };
    implementationStatus: string;
  };
}

describe("createBackendApiRuntime", () => {
  it("falls back to the all-deferred runtime when nothing is configured", async () => {
    const runtime = createBackendApiRuntime({ shopify: () => null, klaviyo: () => null });
    const statuses = await runtime.sourceStatuses();
    expect(statuses).toHaveLength(4);
    for (const status of statuses) {
      expect(status.state).toBe("not_configured");
      expect(status.warningCodes).toContain("LIVE_CREDENTIAL_VERIFICATION_DEFERRED");
    }
  });

  it("treats a malformed source configuration as not configured instead of crashing", () => {
    const runtime = createBackendApiRuntime({
      shopify: () => {
        throw new Error("bad env");
      },
      klaviyo: () => null,
    });
    expect(runtime.environment).toBe("production");
  });
});

describe("LiveBackendApiRuntime", () => {
  it("loads the Sheets contributors required by Executive and Revenue", () => {
    // Executive Health is migrated onto the new workbook via sheets-executive;
    // sheets-operations stays on the legacy workbook for Operations Intelligence.
    expect(LIVE_DASHBOARD_SECTION_PLAN["Executive Health"]).toContain("sheets-executive");
    expect(LIVE_DASHBOARD_SECTION_PLAN["Executive Health"]).not.toContain("sheets-operations");
    expect(LIVE_DASHBOARD_SECTION_PLAN["Operations Intelligence"]).toContain("sheets-operations");
    expect(LIVE_DASHBOARD_SECTION_PLAN["Revenue Intelligence"]).toContain("v1-composite-metrics");
    expect(LIVE_DASHBOARD_SECTION_PLAN["Product Intelligence"]).toContain(
      "product-sheet-example-metrics",
    );
  });

  it("serves certifiable Shopify values while blocked metrics stay null", async () => {
    const runtime = new LiveBackendApiRuntime(shopifySettings, klaviyoConfiguration, {
      fetchImplementation: stubFetch(),
    });
    const result = await runtime.loadDashboard("Executive Health", filters);

    const returningRate = metricByKey(result.page, "customers.returning_rate");
    expect(returningRate.value).toEqual({ kind: "rate_basis_points", value: 2_500 });
    expect(returningRate.readiness.state).toBe("current");

    // DEC-015-activated revenue metrics pass through canonical provider values.
    const netSales = metricByKey(result.page, "commerce.net_sales");
    expect(netSales.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 1_615_354 },
    });
    const aov = metricByKey(result.page, "commerce.average_order_value");
    expect(aov.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 11_424 } });

    // Still-unapproved rules never receive values even with live data.
    const healthScore = metricByKey(result.page, "executive.business_health_score");
    expect(healthScore.value).toBeNull();
    expect(healthScore.readiness.warningCodes).toContain("BUSINESS_RULE_REQUIRED");
  });

  it("keeps sibling variant SKUs of one product on distinctly labelled bars", async () => {
    const runtime = new LiveBackendApiRuntime(shopifySettings, klaviyoConfiguration, {
      fetchImplementation: stubFetch({
        productLineRows: [
          ...defaultProductLineRows,
          {
            line_type: "product",
            product_title: "70% Cacao Dark Chocolate",
            product_variant_title: "4-Pack",
            product_variant_sku: "ZAC-DC-70-4PK",
            net_sales: "2690.00",
            orders: "31",
            net_items_sold: "124",
          },
        ],
      }),
    });
    const result = await runtime.loadDashboard("Product Intelligence", filters);

    const sales = result.page.breakdowns.find(({ metric }) => metric.key === "products.sales");
    expect(sales?.items.map(({ label }) => label)).toEqual([
      "70% Cacao Dark Chocolate · 10-Pack",
      "70% Cacao Dark Chocolate · 4-Pack",
    ]);
  });

  it("includes commerce.total_sales on Financial Intelligence, not just Revenue", async () => {
    const runtime = new LiveBackendApiRuntime(shopifySettings, klaviyoConfiguration, {
      fetchImplementation: stubFetch(),
    });
    const result = await runtime.loadDashboard("Financial Intelligence", filters);

    const totalSales = metricByKey(result.page, "commerce.total_sales");
    expect(totalSales.value).not.toBeNull();
    expect(totalSales.readiness.state).toBe("current");
  });

  it("returns truthful no-activity Klaviyo states for an empty account", async () => {
    const runtime = new LiveBackendApiRuntime(shopifySettings, klaviyoConfiguration, {
      fetchImplementation: stubFetch(),
    });
    const result = await runtime.loadDashboard("Marketing Intelligence", filters);

    const traffic = metricByKey(result.page, "traffic.attribution");
    expect(traffic.value).toEqual({ kind: "count", value: 400 });

    const emailOverview = metricByKey(result.page, "klaviyo.email_overview");
    expect(emailOverview.value).toBeNull();
    expect(emailOverview.readiness.state).toBe("no_activity");
    expect(emailOverview.implementationStatus).toBe("DATA_PENDING");

    const klaviyoStatus = result.page.sources.find((source) => source.source === "klaviyo");
    expect(klaviyoStatus?.state).toBe("no_activity");
  });

  it("serves certified Customer session and city metrics while optional demographics stay unconfigured", async () => {
    const runtime = new LiveBackendApiRuntime(shopifySettings, klaviyoConfiguration, {
      fetchImplementation: stubFetch(),
    });
    const result = await runtime.loadDashboard("Customer Intelligence", filters);

    expect(metricByKey(result.page, "engagement.time_on_site").value).toEqual({
      kind: "duration_seconds",
      value: 192,
    });
    const city = result.page.breakdowns.find(({ metric }) => metric.key === "customers.geo_city");
    expect(city?.items[0]).toMatchObject({ label: "New York, NY" });
    expect(metricByKey(result.page, "customers.age_mix").readiness.state).toBe("not_configured");
    expect(metricByKey(result.page, "marketing.cac").value).toBeNull();
  });

  it("isolates a failing dataset as partial without fabricating zeros", async () => {
    const runtime = new LiveBackendApiRuntime(shopifySettings, klaviyoConfiguration, {
      fetchImplementation: stubFetch({ failFunnel: true }),
    });
    const result = await runtime.loadDashboard("Customer Intelligence", filters);

    // Customers dataset still succeeds.
    const newCount = metricByKey(result.page, "customers.new_count");
    expect(newCount.value).toEqual({ kind: "count", value: 300 });

    // Funnel dataset failed: merged Shopify status is partial, funnel metric has no value.
    const shopifyStatus = result.page.sources.find((source) => source.source === "shopify");
    expect(shopifyStatus?.state).toBe("partial");
    expect(shopifyStatus?.warningCodes).toContain("PARTIAL_DATASET_FAILURE");
    const funnel = metricByKey(result.page, "commerce.web_funnel");
    expect(funnel.value).toBeNull();
  });

  it("probes live sources without exposing the removed manual-workbook source", async () => {
    const runtime = new LiveBackendApiRuntime(shopifySettings, klaviyoConfiguration, {
      fetchImplementation: stubFetch(),
    });
    const statuses = await runtime.sourceStatuses();
    expect(statuses.find((status) => status.source === "shopify")?.state).toBe("current");
    expect(statuses.find((status) => status.source === "klaviyo")?.state).toBe("no_activity");
    expect(statuses).toHaveLength(4);
    expect(statuses.find((status) => status.source === "google_sheets")?.state).toBe(
      "not_configured",
    );
    expect(statuses.find((status) => status.source === "google_drive")?.state).toBe(
      "not_configured",
    );
  });
});

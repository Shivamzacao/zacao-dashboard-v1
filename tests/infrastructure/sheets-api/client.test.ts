import { describe, expect, it, vi } from "vitest";

import { SheetsApiClient } from "@/src/infrastructure/sheets-api/client";
import { parseSheetsApiConfiguration } from "@/src/infrastructure/sheets-api/config";

const credential = {
  projectId: "dashboard-test",
  clientEmail: "reader@example.test",
  privateKey: "x".repeat(64),
};
const workbookId = "1vOkSXadR0WAFmUgWUvZmxmOoxVs5fxYkIW3GT2FmjjA";

const metadata = (titles: readonly string[]) => ({
  spreadsheetId: workbookId,
  properties: { title: "zacao-main-sheet", timeZone: "America/New_York" },
  sheets: titles.map((title) => ({
    properties: { title, gridProperties: { rowCount: 10, columnCount: 20 } },
  })),
});

const inventoryRows = [
  [
    "",
    "snapshot_at",
    "warehouse",
    "sku",
    "on_hand",
    "committed",
    "available",
    "damaged",
    "incoming",
    "source_status",
    "data_as_of",
    "created_at",
    "updated_at",
    "updated_by",
    "source_reference",
    "notes",
  ],
  [
    "SNAP-01",
    "2026-08-10 06:00",
    "SNAPL 3PL",
    "SKU-01",
    "120",
    "30",
    "90",
    "0",
    "0",
    "production",
    "2026-08-10",
  ],
];

function configuration() {
  return parseSheetsApiConfiguration({ workbookId, ...credential });
}

function clientFetch(options: {
  titles?: readonly string[];
  rows?: readonly (readonly unknown[])[];
  failBatch?: boolean;
}) {
  return vi.fn(async (url: string | URL | Request) => {
    const value = String(url);
    if (value.includes("values:batchGet")) {
      if (options.failBatch) throw new Error("offline");
      return Response.json({ valueRanges: [{ values: options.rows ?? inventoryRows }] });
    }
    return Response.json(metadata(options.titles ?? ["Inventory_Snapshots"]));
  });
}

describe("SheetsApiClient direct Google source", () => {
  it("normalizes native Sheets table dates from the workbook locale", async () => {
    const rows = [
      [
        "order_id",
        "customer_id",
        "order_date",
        "first_order_date",
        "gross_product_sales_usd",
        "discounts_usd",
        "refunds_returns_usd",
        "cancellations_usd",
        "net_product_revenue_usd",
        "order_status",
        "acquisition_channel",
        "currency",
        "is_test",
        "data_as_of",
        "source_status",
      ],
      [
        "O-1",
        "C-1",
        "9/5/2025",
        "9/5/2025",
        100,
        0,
        0,
        0,
        100,
        "paid",
        "Online Store",
        "USD",
        "no",
        "8/11/2026",
        "production",
      ],
    ];
    const fetchMock = clientFetch({ titles: ["Sales_Actuals"], rows });
    const client = new SheetsApiClient(configuration(), {
      fetch: fetchMock as typeof fetch,
      accessToken: async () => "token",
    });
    const result = await client.readPageTabs("customers", ["Sales_Actuals"]);

    expect(result.tabs["Sales_Actuals"]?.[0]).toMatchObject({
      order_date: "2025-09-05",
      first_order_date: "2025-09-05",
      data_as_of: "2026-08-11",
    });
  });

  it("keeps validated example rows separate from production rows", async () => {
    const rows = [
      [
        "order_id",
        "customer_id",
        "order_date",
        "first_order_date",
        "gross_product_sales_usd",
        "discounts_usd",
        "refunds_returns_usd",
        "cancellations_usd",
        "net_product_revenue_usd",
        "order_status",
        "acquisition_channel",
        "currency",
        "is_test",
        "data_as_of",
        "source_status",
      ],
      [
        "PROD-1",
        "C-1",
        "8/1/2026",
        "8/1/2026",
        100,
        0,
        0,
        0,
        100,
        "paid",
        "Online Store",
        "USD",
        "no",
        "8/11/2026",
        "production",
      ],
      [
        "DEMO-1",
        "DUMMY-CUSTOMER",
        "8/2/2026",
        "8/2/2026",
        80,
        0,
        0,
        0,
        80,
        "paid",
        "Online Store",
        "USD",
        "no",
        "8/11/2026",
        "example",
      ],
    ];
    const client = new SheetsApiClient(configuration(), {
      fetch: clientFetch({ titles: ["Sales_Actuals"], rows }) as typeof fetch,
      accessToken: async () => "token",
    });

    const result = await client.readPageTabs("customers", ["Sales_Actuals"]);

    expect(result.tabs["Sales_Actuals"]?.map((row) => row["order_id"])).toEqual(["PROD-1"]);
    expect(result.exampleTabs?.["Sales_Actuals"]?.map((row) => row["order_id"])).toEqual([
      "DEMO-1",
    ]);
    expect(result.sourceStatus.state).toBe("current");
  });

  it("reads the new Marketing_Spend width so example campaigns stay out of production", async () => {
    // The contract used to stop at Q, leaving source_status (R) unread — every row
    // then looked like production and the workbook's own DEMO rows shipped as spend.
    const rows = [
      [
        "record_id",
        "date",
        "week_ending",
        "platform",
        "account",
        "campaign_id",
        "campaign_name",
        "spend_usd",
        "impressions",
        "clicks",
        "conversions",
        "new_customers_acquired",
        "attributed_revenue_usd",
        "cpc_usd",
        "cpa_usd",
        "cac_usd",
        "roas",
        "source_status",
        "data_as_of",
        "created_at",
        "updated_at",
        "updated_by",
        "source_reference",
        "notes",
      ],
      // prettier-ignore
      ["MKT-1", "7/5/2026", "7/11/2026", "Meta", "ZACAO Main", "", "Summer prospecting",
       1850, 412000, 8600, 132, 9, "", 0.215, 14.02, "", 0,
       "production", "7/5/2026", "", "", "", "", ""],
      // prettier-ignore
      ["MKT-2", "7/25/2026", "7/25/2026", "Meta", "ZACAO Main", "", "DEMO Late July prospecting",
       1240, 288000, 6100, 94, 61, 4820, 0.203, 13.19, 20.33, 3.887,
       "example", "7/25/2026", "", "", "", "", "DEMO ROW — delete before go-live"],
    ];
    const client = new SheetsApiClient(configuration(), {
      fetch: clientFetch({ titles: ["Marketing_Spend"], rows }) as typeof fetch,
      accessToken: async () => "token",
    });

    const result = await client.readPageTabs("migrated", ["Marketing_Spend"]);

    expect(result.tabs["Marketing_Spend"]?.map((row) => row["record_id"])).toEqual(["MKT-1"]);
    expect(result.exampleTabs?.["Marketing_Spend"]?.map((row) => row["record_id"])).toEqual([
      "MKT-2",
    ]);
    // The CAC denominator and the freshness stamp are now inside the read window.
    expect(result.tabs["Marketing_Spend"]?.[0]?.["new_customers_acquired"]).toBe(9);
    expect(result.tabs["Marketing_Spend"]?.[0]?.["data_as_of"]).toBe("2026-07-05");
    expect(result.warnings).toEqual([]);
  });

  it("keeps a legacy 17-column Marketing_Spend valid with the new columns null", async () => {
    const rows = [
      // prettier-ignore
      ["record_id", "date", "platform", "account", "campaign_id", "campaign_name", "spend_usd",
       "impressions", "clicks", "conversions", "source_status", "data_as_of", "created_at",
       "updated_at", "updated_by", "source_reference", "notes"],
      // prettier-ignore
      ["LEG-1", "7/6/2026", "Google", "ZACAO Main", "", "Legacy search", 500, 1000, 40, 5,
       "production", "7/6/2026", "", "", "", "", ""],
    ];
    const client = new SheetsApiClient(configuration(), {
      fetch: clientFetch({ titles: ["Marketing_Spend"], rows }) as typeof fetch,
      accessToken: async () => "token",
    });

    const result = await client.readPageTabs("marketing", ["Marketing_Spend"]);
    const row = result.tabs["Marketing_Spend"]?.[0];

    expect(row?.["record_id"]).toBe("LEG-1");
    expect(row?.["spend_usd"]).toBe(500);
    expect(row?.["new_customers_acquired"]).toBeNull();
    expect(row?.["week_ending"]).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("batch reads and normalizes requested tabs", async () => {
    const fetchMock = clientFetch({});
    const client = new SheetsApiClient(configuration(), {
      fetch: fetchMock as typeof fetch,
      accessToken: async () => "token",
      now: () => new Date("2026-08-10T12:00:00.000Z"),
    });
    const result = await client.readPageTabs("operations", ["Inventory_Snapshots"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("values:batchGet"))).toBe(
      true,
    );
    expect(result.tabs["Inventory_Snapshots"]?.[0]).toMatchObject({ on_hand: 120, available: 90 });
    expect(result.sourceStatus.state).toBe("current");
  });

  it("deduplicates simultaneous identical page reads", async () => {
    const fetchMock = clientFetch({});
    const client = new SheetsApiClient(configuration(), {
      fetch: fetchMock as typeof fetch,
      accessToken: async () => "token",
    });
    await Promise.all([
      client.readPageTabs("operations", ["Inventory_Snapshots"]),
      client.readPageTabs("operations", ["Inventory_Snapshots"]),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("isolates a missing tab as a partial result", async () => {
    const fetchMock = clientFetch({ titles: ["Inventory_Snapshots"] });
    const client = new SheetsApiClient(configuration(), {
      fetch: fetchMock as typeof fetch,
      accessToken: async () => "token",
    });
    const result = await client.readPageTabs("operations", [
      "Inventory_Snapshots",
      "Additional_Depletions",
    ]);
    expect(result.tabs["Inventory_Snapshots"]).toHaveLength(1);
    expect(result.tabs["Additional_Depletions"]).toEqual([]);
    expect(result.sourceStatus.state).toBe("partial");
  });

  it("serves validated stale data for up to fifteen minutes", async () => {
    let now = new Date("2026-08-10T12:00:00.000Z");
    const fetchMock = clientFetch({});
    const client = new SheetsApiClient(configuration(), {
      fetch: fetchMock as typeof fetch,
      accessToken: async () => "token",
      now: () => now,
    });
    await client.readPageTabs("operations", ["Inventory_Snapshots"]);
    now = new Date("2026-08-10T12:01:00.000Z");
    fetchMock.mockImplementation(async () => {
      throw new Error("offline");
    });
    const result = await client.readPageTabs("operations", ["Inventory_Snapshots"]);
    expect(result.sourceStatus.state).toBe("stale");
    expect(result.tabs["Inventory_Snapshots"]).toHaveLength(1);
  });
});

/**
 * The new operations workbook returns values in shapes the legacy workbook never
 * used: unformatted date serials, real checkbox booleans, Title Case dropdowns,
 * connector-owned source_status values, and ~150 pre-seeded formula rows per tab.
 */
describe("SheetsApiClient reading the new operations workbook", () => {
  const executiveWorkbookId = "1RYJFlh6QqzSTz8-0BDxVzqv2ghj1IaRFzF-0pi5ab4w";

  const executiveConfiguration = () =>
    parseSheetsApiConfiguration({ workbookId: executiveWorkbookId, ...credential }, "executive");

  function executiveFetch(titles: readonly string[], rows: readonly (readonly unknown[])[]) {
    return vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("values:batchGet")) {
        return Response.json({ valueRanges: [{ values: rows }] });
      }
      return Response.json({
        spreadsheetId: executiveWorkbookId,
        properties: {
          title: "ZACAO Weekly Operations Workbook - Final",
          timeZone: "America/New_York",
        },
        sheets: titles.map((title) => ({
          properties: { title, gridProperties: { rowCount: 500, columnCount: 30 } },
        })),
      });
    });
  }

  const read = async (tab: string, rows: readonly (readonly unknown[])[]) => {
    const client = new SheetsApiClient(executiveConfiguration(), {
      fetch: executiveFetch([tab], rows) as typeof fetch,
      accessToken: async () => "token",
    });
    return client.readPageTabs("migrated", [tab]);
  };

  const inventoryHeaders = [
    "record_id",
    "snapshot_at",
    "week_ending",
    "warehouse",
    "sku",
    "on_hand",
    "committed",
    "available",
    "damaged",
    "incoming",
    "source_status",
    "data_as_of",
    "created_at",
    "updated_at",
    "updated_by",
    "source_reference",
    "notes",
  ];

  it("converts Google date serials and keeps connector-owned rows live", async () => {
    // The two real rows in the live workbook: Shopify-fed SNAPL stock.
    const result = await read("Inventory_Snapshots", [
      inventoryHeaders,
      ["INV-SHOP-1", 46247, 46249, "SNAPL", "SKU-01", 8, 8, 0, 0, 0, "shopify", 46247],
      ["INV-SHOP-2", 46247, 46249, "SNAPL", "SKU-02", 580, 20, 560, 0, 0, "shopify", 46247],
    ]);

    expect(result.warnings).toEqual([]);
    expect(result.tabs["Inventory_Snapshots"]).toHaveLength(2);
    expect(result.tabs["Inventory_Snapshots"]?.[0]).toMatchObject({
      snapshot_at: "2026-08-13T00:00:00Z",
      week_ending: "2026-08-15",
      data_as_of: "2026-08-13",
      warehouse: "SNAPL",
      on_hand: 8,
    });
  });

  it("leaves genuine quantities alone when a numeric column looks like a serial", async () => {
    const result = await read("Inventory_Snapshots", [
      inventoryHeaders,
      ["INV-1", 46247, 46249, "SNAPL", "SKU-02", 46_223, 0, 46_223, 0, 0, "production", 46247],
    ]);
    // on_hand is an integer column, so the serial window must not touch it.
    expect(result.tabs["Inventory_Snapshots"]?.[0]).toMatchObject({ on_hand: 46_223 });
  });

  it("folds Title Case dropdowns onto the contract's snake_case enums", async () => {
    const result = await read("Additional_Depletions", [
      [
        "record_id",
        "movement_date",
        "week_ending",
        "warehouse",
        "sku",
        "quantity",
        "reason",
        "recipient_or_project",
        "reference",
        "source_status",
      ],
      ["DEP-1", 46247, 46249, "SNAPL", "SKU-01", 12, "Sampling", "Team", "REF-1", "production"],
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.tabs["Additional_Depletions"]?.[0]).toMatchObject({ reason: "sampling" });
  });

  it("accepts the new workbook's weekly All Social aggregate row", async () => {
    // Marketing Input records reach/impressions/engagements once per week rather than
    // per platform, so Social_Metrics emits four follower rows plus one "All Social" row
    // carrying those totals. Before the enum was widened this row failed its required
    // platform column, costing a SHEETS_ROW_INVALID warning for every week in the sheet.
    const result = await read("Social_Metrics", [
      ["record_id", "snapshot_date", "platform", "account", "followers", "reach", "source_status"],
      ["SOC-1-Instagram", 46249, "Instagram", "ZACAO", 12_480, "", "production"],
      ["SOC-1-All Social", 46249, "All Social", "ZACAO", "", 96_000, "production"],
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.tabs["Social_Metrics"]?.[1]).toMatchObject({
      platform: "all_social",
      reach: 96_000,
    });
  });

  it("reads checkbox booleans as yes/no enum values", async () => {
    const result = await read("Location_Master", [
      ["location_id", "location_name", "location_type", "is_active", "source_status"],
      ["LOC-01", "SNAPL", "warehouse", true, "shopify"],
      ["LOC-02", "YBYD", "warehouse", false, "production"],
    ]);
    expect(result.tabs["Location_Master"]?.[0]).toMatchObject({ is_active: "yes" });
    expect(result.tabs["Location_Master"]?.[1]).toMatchObject({ is_active: "no" });
  });

  it("drops draft and backend_pending rows silently rather than warning", async () => {
    const result = await read("Inventory_Snapshots", [
      inventoryHeaders,
      ["INV-1", 46247, 46249, "SNAPL", "SKU-01", 8, 0, 8, 0, 0, "production", 46247],
      ["INV-2", 46247, 46249, "SNAPL", "SKU-02", 99, 0, 99, 0, 0, "draft", 46247],
      ["INV-3", 46247, 46249, "SNAPL", "SKU-03", 77, 0, 77, 0, 0, "backend_pending", 46247],
    ]);
    // A draft row must never reach the dashboard, and it is not a data problem
    // the team can act on, so it must not raise a warning either.
    expect(result.tabs["Inventory_Snapshots"]).toHaveLength(1);
    expect(result.tabs["Inventory_Snapshots"]?.[0]).toMatchObject({ sku: "SKU-01" });
    expect(result.warnings).toEqual([]);
  });

  it("skips pre-seeded formula template rows without flooding warnings", async () => {
    const result = await read("Inventory_Snapshots", [
      inventoryHeaders,
      ["INV-1", 46247, 46249, "SNAPL", "SKU-01", 8, 0, 8, 0, 0, "production", 46247],
      // Scaffolding: identifier and provenance only, no business values.
      [
        "INV-2",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "production",
        "",
        "",
        "",
        "",
        "Inventory Input!A7",
      ],
      [
        "INV-3",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "production",
        "",
        "",
        "",
        "",
        "Inventory Input!A8",
      ],
    ]);
    expect(result.tabs["Inventory_Snapshots"]).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it("skips template rows that carry constant enums and zero-valued formulas", async () => {
    // Verbatim shapes from the live workbook: scaffolding rows are not blank —
    // they resolve a constant enum and a formula that lands on 0.
    const inventory = await read("Inventory_Snapshots", [
      inventoryHeaders,
      [
        "INV-EXT-1",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        0,
        "production",
        "",
        "",
        "",
        "",
        "Inventory Input!A7:N7",
      ],
    ]);
    expect(inventory.tabs["Inventory_Snapshots"]).toHaveLength(0);
    expect(inventory.warnings).toEqual([]);

    const cogs = await read("COGS_By_SKU", [
      [
        "record_id",
        "sku",
        "effective_from",
        "effective_to",
        "cost_basis",
        "production_cost_usd",
        "packaging_usd",
        "freight_usd",
        "fulfillment_usd",
        "total_unit_cost_usd",
        "source_status",
        "data_as_of",
        "created_at",
        "updated_at",
        "updated_by",
        "source_reference",
        "notes",
      ],
      [
        "COGS-BASE-1",
        "SKU-01",
        46_223,
        "",
        "landed",
        1.501,
        0.09,
        0.8,
        0,
        2.301,
        "production",
        46_247,
      ],
      [
        "COGS-PO-1",
        "",
        "",
        "",
        "landed",
        "",
        "",
        "",
        0,
        "",
        "production",
        "",
        "",
        "",
        "",
        "Production Input!A6:R6",
      ],
    ]);
    expect(cogs.tabs["COGS_By_SKU"]).toHaveLength(1);
    expect(cogs.tabs["COGS_By_SKU"]?.[0]).toMatchObject({
      sku: "SKU-01",
      effective_from: "2026-07-20",
      total_unit_cost_usd: 2.301,
    });
    expect(cogs.warnings).toEqual([]);
  });

  it("still reports a genuinely incomplete row as invalid", async () => {
    const result = await read("Inventory_Snapshots", [
      inventoryHeaders,
      // Real business content but no warehouse: a data-entry problem worth surfacing.
      ["INV-1", 46247, 46249, "", "SKU-01", 8, 0, 8, 0, 0, "production", 46247],
    ]);
    expect(result.tabs["Inventory_Snapshots"]).toHaveLength(0);
    expect(result.warnings).toEqual(["SHEETS_ROW_INVALID:Inventory_Snapshots:2"]);
  });

  const channelHeaders = [
    "record_id",
    "period_start",
    "period_end",
    "platform",
    "account",
    "mentions",
    "audience_reach",
    "attributed_net_sales_usd",
    "attribution_source",
    "source_status",
    "data_as_of",
    "created_at",
    "updated_at",
    "updated_by",
    "source_reference",
    "notes",
  ];

  it("treats a required column that never varies as provenance, not identifying content", async () => {
    // Social_Channel_Performance ships ~600 scaffolding rows carrying a constant
    // account and attribution source and nothing else. Both are contract-required,
    // so without the constant rule every one of them warns.
    const result = await read("Social_Channel_Performance", [
      channelHeaders,
      ["CH-SHOP-1", "", "", "", "ZACAO", "", "", "", "Shopify sales channel", "shopify"],
      ["CH-SHOP-2", "", "", "", "ZACAO", "", "", "", "Shopify sales channel", "shopify"],
      // Pre-populated week calendar: a date but still no payload. Genuinely
      // incomplete rather than scaffolding, so this one is still worth surfacing.
      ["CH-SHOP-3", 46249, "", "", "ZACAO", "", "", "", "Shopify sales channel", "shopify"],
    ]);
    expect(result.tabs["Social_Channel_Performance"]).toHaveLength(0);
    expect(result.warnings).toEqual(["SHEETS_ROW_INVALID:Social_Channel_Performance:4"]);
  });

  it("still warns when a required column varies, so real omissions are not hidden", async () => {
    const result = await read("Social_Channel_Performance", [
      channelHeaders,
      ["CH-1", "", "", "", "ZACAO", "", "", "", "Shopify sales channel", "shopify"],
      // A second account means the column identifies the row after all.
      ["CH-2", "", "", "", "ZACAO Wholesale", "", "", "", "Shopify sales channel", "shopify"],
    ]);
    expect(result.tabs["Social_Channel_Performance"]).toHaveLength(0);
    expect(result.warnings).toEqual([
      "SHEETS_ROW_INVALID:Social_Channel_Performance:2",
      "SHEETS_ROW_INVALID:Social_Channel_Performance:3",
    ]);
  });

  it("keeps reading a fully populated row on a tab with constant columns", async () => {
    const result = await read("Social_Channel_Performance", [
      channelHeaders,
      ["CH-SHOP-1", "", "", "", "ZACAO", "", "", "", "Shopify sales channel", "shopify"],
      [
        "CH-SHOP-2",
        46242,
        46249,
        "Instagram",
        "ZACAO",
        12,
        3400,
        250.5,
        "Shopify sales channel",
        "shopify",
      ],
    ]);
    expect(result.tabs["Social_Channel_Performance"]).toHaveLength(1);
    expect(result.tabs["Social_Channel_Performance"]?.[0]).toMatchObject({
      platform: "instagram",
      mentions: 12,
      audience_reach: 3400,
    });
    expect(result.warnings).toEqual([]);
  });

  it("accepts week_ending as the alias for the renamed Sales_Forecast week_start", async () => {
    const result = await read("Sales_Forecast", [
      [
        "record_id",
        "forecast_version",
        "week_ending",
        "sku",
        "channel",
        "forecast_units",
        "forecast_revenue_usd",
        "status",
        "source_status",
      ],
      ["FC-1", "Backend Sales", 46249, "SKU-01", "DTC (Shopify)", 100, 450, "approved", "backend"],
    ]);
    // Without the alias the required header is missing and the whole tab drops.
    expect(result.warnings).not.toContain("SHEETS_TAB_INVALID:Sales_Forecast");
    expect(result.tabs["Sales_Forecast"]?.[0]).toMatchObject({
      week_start: "2026-08-15",
      forecast_units: 100,
    });
  });
});

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

import { describe, expect, it, vi } from "vitest";

import { SheetsApiClient } from "@/src/infrastructure/sheets-api/client";
import { parseSheetsApiConfiguration } from "@/src/infrastructure/sheets-api/config";

const payload = {
  Location_Master: {
    success: true,
    data: [
      {
        _rowNumber: 2,
        location_id: "LOC-01",
        location_name: "SNAPL 3PL",
        is_active: "yes",
        source_status: "production",
        data_as_of: "2026-08-10",
      },
    ],
    offset: null,
  },
  Inventory_Snapshots: {
    success: true,
    data: [
      {
        record_id: "SNAP-01",
        snapshot_at: "2026-08-10 06:00",
        warehouse: "SNAPL 3PL",
        sku: "SKU-01",
        on_hand: "120",
        available: "90",
        source_status: "production",
        data_as_of: "2026-08-10",
      },
    ],
  },
};

describe("SheetsApiClient", () => {
  it("normalizes numeric strings, drops transport metadata, and deduplicates aggregate reads", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      void url;
      return Response.json(payload);
    });
    const client = new SheetsApiClient(
      parseSheetsApiConfiguration({ aggregateUrl: "https://example.test/all" }),
      { fetch: fetchMock as typeof fetch, now: () => new Date("2026-08-10T12:00:00.000Z") },
    );
    const [inventory, locations] = await Promise.all([
      client.readPageTabs("operations", ["Inventory_Snapshots"]),
      client.readPageTabs("operations", ["Location_Master"]),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(inventory.tabs["Inventory_Snapshots"]?.[0]).toMatchObject({
      on_hand: 120,
      available: 90,
    });
    expect(inventory.tabs["Inventory_Snapshots"]?.[0]).not.toHaveProperty("_rowNumber");
    expect(locations.sourceStatus).toMatchObject({ source: "google_sheets", state: "current" });
  });

  it("isolates a missing optional tab as partial instead of failing valid tabs", async () => {
    const client = new SheetsApiClient(
      parseSheetsApiConfiguration({ aggregateUrl: "https://example.test/all" }),
      { fetch: (async () => Response.json(payload)) as typeof fetch },
    );
    const result = await client.readPageTabs("operations", [
      "Location_Master",
      "Additional_Depletions",
    ]);
    expect(result.tabs["Location_Master"]).toHaveLength(1);
    expect(result.tabs["Additional_Depletions"]).toEqual([]);
    expect(result.sourceStatus.state).toBe("partial");
    expect(result.warnings).toContain("SHEETS_TAB_MISSING:Additional_Depletions");
  });

  it("uses a dedicated tab endpoint ahead of the aggregate fallback", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("inventory")) return Response.json(payload.Inventory_Snapshots);
      return Response.json(payload);
    });
    const client = new SheetsApiClient(
      parseSheetsApiConfiguration({
        aggregateUrl: "https://example.test/all",
        tabUrlsJson: JSON.stringify({ Inventory_Snapshots: "https://example.test/inventory" }),
      }),
      { fetch: fetchMock as typeof fetch },
    );
    const result = await client.readPageTabs("operations", [
      "Inventory_Snapshots",
      "Location_Master",
    ]);
    expect(result.tabs["Inventory_Snapshots"]).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serves last-known-good aggregate data for fifteen minutes after failure", async () => {
    let now = new Date("2026-08-10T12:00:00.000Z");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(payload))
      .mockRejectedValueOnce(new Error("offline"));
    const client = new SheetsApiClient(
      parseSheetsApiConfiguration({ aggregateUrl: "https://example.test/all" }),
      { fetch: fetchMock as typeof fetch, now: () => now },
    );
    await client.readPageTabs("operations", ["Location_Master"]);
    now = new Date("2026-08-10T12:06:00.000Z");
    const stale = await client.readPageTabs("operations", ["Location_Master"]);
    expect(stale.sourceStatus.state).toBe("stale");
    expect(stale.tabs["Location_Master"]).toHaveLength(1);
  });

  it("routes each dashboard to its page endpoint without calling the aggregate URL", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      void url;
      return Response.json(payload);
    });
    const client = new SheetsApiClient(
      parseSheetsApiConfiguration({
        aggregateUrl: "https://example.test/all",
        pageUrlsJson: JSON.stringify({
          operations: "https://example.test/operations",
          product: "https://example.test/product",
        }),
      }),
      { fetch: fetchMock as typeof fetch },
    );
    await client.readPageTabs("operations", ["Location_Master"]);
    await client.readPageTabs("product", ["Inventory_Snapshots"]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://example.test/operations",
      "https://example.test/product",
    ]);
  });
});

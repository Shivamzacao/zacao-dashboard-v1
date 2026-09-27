import { describe, expect, it, vi } from "vitest";

import type { LoggerPort } from "@/src/application/ports";
import type { SheetsTabDataSource, SheetsTabReadResult } from "@/src/application/ports/sheets-tabs";
import type { SourceStatus } from "@/src/domain/contracts";
import type { ShopifyCommerceReader } from "@/src/infrastructure/shopify/commerce-reader";
import { ParityLedger } from "@/src/infrastructure/sources/parity-ledger";
import { ParityTabSource } from "@/src/infrastructure/sources/parity-tab-source";
import { parseSourceMode } from "@/src/infrastructure/sources/source-mode";

const status: SourceStatus = {
  source: "google_sheets",
  state: "current",
  checkedAt: "2026-09-27T12:00:00.000Z",
  lastSuccessfulAt: "2026-09-27T12:00:00.000Z",
  dataAsOf: "2026-09-27T12:00:00.000Z",
  completeness: "complete",
  warningCodes: [],
};

function sheet(): { source: SheetsTabDataSource; readPageTabs: ReturnType<typeof vi.fn> } {
  const result: SheetsTabReadResult = {
    tabs: { Location_Master: [{ location_name: "SNAPL", is_active: "yes" }] },
    sourceStatus: status,
    warnings: [],
  };
  const readPageTabs = vi.fn(async () => result);
  return { source: { readPageTabs, sourceStatus: () => status }, readPageTabs };
}

const logger = (): LoggerPort => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });

function reader(overrides: Partial<ShopifyCommerceReader> = {}): ShopifyCommerceReader {
  return {
    readLocations: vi.fn(async () => ({
      status: "ok" as const,
      truncated: false,
      data: [
        {
          source: "shopify" as const,
          locationId: "gid://shopify/Location/1",
          name: "SNAPL",
          isActive: true,
          hasActiveInventory: true,
          shipsInventory: true,
          fulfillsOnlineOrders: true,
        },
      ],
    })),
    ...overrides,
  } as unknown as ShopifyCommerceReader;
}

const now = () => new Date("2026-09-27T12:00:00Z");

describe("source mode", () => {
  it("defaults to legacy and never silently accepts an unknown value", () => {
    expect(parseSourceMode(undefined)).toEqual({ mode: "legacy", invalidValue: null });
    expect(parseSourceMode(" Parallel ")).toEqual({ mode: "parallel", invalidValue: null });
    expect(parseSourceMode("sheets-off")).toEqual({ mode: "legacy", invalidValue: "sheets-off" });
  });
});

describe("parity tab source", () => {
  it("is a pure pass-through in legacy mode", async () => {
    const { source, readPageTabs } = sheet();
    const readerFactory = vi.fn();
    const parity = new ParityTabSource(source, {
      mode: "legacy",
      ledger: new ParityLedger(),
      logger: logger(),
      now,
      reader: readerFactory,
    });
    await parity.readPageTabs("migrated", ["Location_Master"]);
    expect(readPageTabs).toHaveBeenCalledOnce();
    expect(readerFactory).not.toHaveBeenCalled();
  });

  it("returns the sheet rows unchanged and records a reconciliation in parallel mode", async () => {
    const { source } = sheet();
    const ledger = new ParityLedger();
    const parity = new ParityTabSource(source, {
      mode: "parallel",
      ledger,
      logger: logger(),
      now,
      reader: async () => reader(),
    });
    const result = await parity.readPageTabs("migrated", ["Location_Master"]);
    expect(result.tabs["Location_Master"]).toEqual([{ location_name: "SNAPL", is_active: "yes" }]);
    await parity.compareNow("migrated", ["Location_Master"]);
    const [entry] = ledger.latest();
    expect(entry).toMatchObject({ dataset: "Location_Master", outcome: "compared" });
    expect(entry?.outcome === "compared" && entry.report.status).toBe("match");
  });

  it("records an unreadable API side as skipped rather than an empty comparison", async () => {
    const { source } = sheet();
    const ledger = new ParityLedger();
    const log = logger();
    const parity = new ParityTabSource(source, {
      mode: "api",
      ledger,
      logger: log,
      now,
      reader: async () =>
        reader({
          readLocations: vi.fn(async () => ({
            status: "not_authorized" as const,
            reason: "SHOPIFY_PERMISSION",
          })),
        }),
    });
    await parity.readPageTabs("migrated", ["Location_Master"]);
    await parity.compareNow("migrated", ["Location_Master"]);
    expect(ledger.latest()[0]).toMatchObject({
      outcome: "skipped",
      reason: "SHOPIFY_LOCATIONS_UNREADABLE",
      status: "not_authorized",
    });
    expect(log.warn).toHaveBeenCalledWith(
      "source_mode.api_without_certified_tabs",
      expect.anything(),
    );
  });

  it("runs at most one background comparison per tab per interval", async () => {
    const { source } = sheet();
    const readLocations = vi.fn(async () => ({
      status: "no_data" as const,
      data: [],
    }));
    const parity = new ParityTabSource(source, {
      mode: "parallel",
      ledger: new ParityLedger(),
      logger: logger(),
      now,
      minIntervalMs: 60_000,
      reader: async () => reader({ readLocations }),
    });
    await parity.readPageTabs("migrated", ["Location_Master"]);
    await parity.readPageTabs("migrated", ["Location_Master"]);
    await parity.readPageTabs("migrated", ["Location_Master"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(readLocations).toHaveBeenCalledTimes(1);
  });
});

import type { LoggerPort } from "@/src/application/ports";
import type {
  SheetsDashboardPage,
  SheetsTabDataSource,
  SheetsTabReadResult,
} from "@/src/application/ports/sheets-tabs";
import type { ReconciliationReport } from "@/src/application/reconciliation/reconcile";
import {
  compareFulfillmentTiming,
  compareLocations,
  compareShopifyMirroredInventory,
  compareSkuIdentity,
  reportingDate,
} from "@/src/application/reconciliation/tab-comparers";
import type { SourceStatus } from "@/src/domain/contracts";
import type { DateRange } from "@/src/domain/contracts/date-range";
import type { SourceReadStatus } from "@/src/domain/sources/read-outcome";
import type { ShopifyCommerceReader } from "@/src/infrastructure/shopify/commerce-reader";

import type { ParityLedger } from "./parity-ledger";
import type { SourceMode } from "./source-mode";

/** Tabs that have a Shopify comparer, and the extra tabs each comparison needs. */
const COMPARABLE_TABS: Readonly<Record<string, readonly string[]>> = {
  SKU_Master: ["SKU_Master"],
  Location_Master: ["Location_Master"],
  Inventory_Snapshots: ["Inventory_Snapshots", "SKU_Master", "Location_Master"],
  Warehouse_Fulfillment: ["Warehouse_Fulfillment"],
};

/** At most one comparison per tab per interval: parity must not multiply API load. */
const DEFAULT_MIN_INTERVAL_MS = 10 * 60_000;

const DAY_MS = 86_400_000;

export interface ParityTabSourceOptions {
  readonly mode: SourceMode;
  readonly reader: () => Promise<ShopifyCommerceReader | null>;
  readonly ledger: ParityLedger;
  readonly logger: LoggerPort;
  readonly now: () => Date;
  readonly minIntervalMs?: number;
}

/**
 * Decorates the Sheets tab source at the one seam every sheet-backed
 * contributor already reads through, so source selection lives here and
 * nowhere else.
 *
 * In `parallel` (and, until a tab is certified, `api`) mode the workbook stays
 * authoritative: its rows are returned unchanged and immediately. The Shopify
 * side is read and reconciled in the background, recorded in the ledger and
 * logged. A comparison failure never affects the page.
 */
export class ParityTabSource implements SheetsTabDataSource {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly lastStarted = new Map<string, number>();
  private announcedApiMode = false;

  constructor(
    private readonly inner: SheetsTabDataSource,
    private readonly options: ParityTabSourceOptions,
  ) {}

  sourceStatus(): SourceStatus {
    return this.inner.sourceStatus();
  }

  async readPageTabs(
    page: SheetsDashboardPage,
    tabNames: readonly string[],
    signal?: AbortSignal,
  ): Promise<SheetsTabReadResult> {
    const result = await this.inner.readPageTabs(page, tabNames, signal);
    if (this.options.mode === "legacy") return result;
    if (this.options.mode === "api" && !this.announcedApiMode) {
      this.announcedApiMode = true;
      this.options.logger.warn("source_mode.api_without_certified_tabs", {
        detail: "No tab has passed parity; serving Google Sheets and reconciling in background.",
      });
    }
    for (const tab of tabNames) {
      if (tab in COMPARABLE_TABS) this.schedule(page, tab);
    }
    return result;
  }

  /** Runs every due comparison now and waits for them (used by the live parity runner). */
  async compareNow(page: SheetsDashboardPage, tabs: readonly string[]): Promise<void> {
    await Promise.all(
      tabs.filter((tab) => tab in COMPARABLE_TABS).map((tab) => this.run(page, tab)),
    );
  }

  private schedule(page: SheetsDashboardPage, tab: string): void {
    const now = this.options.now().getTime();
    const last = this.lastStarted.get(tab);
    if (this.inFlight.has(tab)) return;
    if (last !== undefined && now - last < (this.options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS))
      return;
    void this.run(page, tab);
  }

  private run(page: SheetsDashboardPage, tab: string): Promise<void> {
    const existing = this.inFlight.get(tab);
    if (existing) return existing;
    this.lastStarted.set(tab, this.options.now().getTime());
    const task = this.compare(page, tab)
      .catch((error: unknown) => {
        this.skip(tab, `COMPARISON_ERROR:${error instanceof Error ? error.name : "unknown"}`);
      })
      .finally(() => this.inFlight.delete(tab));
    this.inFlight.set(tab, task);
    return task;
  }

  private skip(dataset: string, reason: string, status?: SourceReadStatus): void {
    const entry = {
      dataset,
      checkedAt: this.options.now().toISOString(),
      outcome: "skipped" as const,
      reason,
      ...(status ? { status } : {}),
    };
    this.options.ledger.record(entry);
    this.options.logger.warn("parity.skipped", { dataset, reason });
  }

  private recordReport(dataset: string, report: ReconciliationReport): void {
    this.options.ledger.record({
      dataset,
      checkedAt: this.options.now().toISOString(),
      outcome: "compared",
      report,
    });
    const log = report.status === "match" ? this.options.logger.info : this.options.logger.warn;
    log.call(this.options.logger, "parity.compared", {
      dataset,
      status: report.status,
      oldCount: report.oldCount,
      newCount: report.newCount,
      matchedKeys: report.matchedKeys,
      onlyInOld: report.onlyInOld.length,
      onlyInNew: report.onlyInNew.length,
      differences: report.differences.length,
    });
  }

  private async compare(page: SheetsDashboardPage, tab: string): Promise<void> {
    const reader = await this.options.reader();
    if (!reader) return this.skip(tab, "SHOPIFY_NOT_CONFIGURED");
    const sheet = await this.inner.readPageTabs(page, COMPARABLE_TABS[tab] ?? [tab]);
    const rows = (name: string) => sheet.tabs[name] ?? [];
    const today = reportingDate(this.options.now().toISOString());
    const period: DateRange = { startDate: today, endDate: today };

    if (tab === "Location_Master") {
      const locations = await reader.readLocations(period);
      if (locations.status !== "ok" && locations.status !== "no_data")
        return this.skip(tab, "SHOPIFY_LOCATIONS_UNREADABLE", locations.status);
      return this.recordReport(tab, compareLocations(rows("Location_Master"), locations.data));
    }

    if (tab === "Warehouse_Fulfillment") {
      const start = new Date(this.options.now().getTime() - 29 * DAY_MS).toISOString();
      const fulfillments = await reader.readFulfillments({
        startDate: reportingDate(start),
        endDate: today,
      });
      if (fulfillments.status !== "ok" && fulfillments.status !== "no_data")
        return this.skip(tab, "SHOPIFY_FULFILLMENTS_UNREADABLE", fulfillments.status);
      return this.recordReport(
        tab,
        compareFulfillmentTiming(rows("Warehouse_Fulfillment"), fulfillments.data),
      );
    }

    const catalog = await reader.readCatalog(period);
    if (catalog.status !== "ok" && catalog.status !== "no_data")
      return this.skip(tab, "SHOPIFY_CATALOG_UNREADABLE", catalog.status);
    if (tab === "SKU_Master")
      return this.recordReport(tab, compareSkuIdentity(rows("SKU_Master"), catalog.data.variants));
    return this.recordReport(
      tab,
      compareShopifyMirroredInventory({
        snapshots: rows("Inventory_Snapshots"),
        skuMaster: rows("SKU_Master"),
        locationMaster: rows("Location_Master"),
        positions: catalog.data.inventory,
      }),
    );
  }
}

import { describe, expect, it } from "vitest";

import type {
  ManualBatchSummary,
  ManualStoreRecord,
  ManualWorkbookStore,
} from "@/src/application/ports/manual-workbook";
import { createManualWorkbookContributors } from "@/src/infrastructure/manual-workbook/contributors";

const context = {
  environment: "production" as const,
  dataPeriod: { startDate: "2026-01-01", endDate: "2026-12-31" },
  filters: {
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    comparison: "none" as const,
    channels: [],
    productSkus: [],
    locations: [],
  },
  reportingTimeZone: "America/New_York" as const,
  currency: "USD" as const,
  sourceStatuses: [],
};

class FakeStore implements ManualWorkbookStore {
  constructor(private readonly tabs: Readonly<Record<string, readonly ManualStoreRecord[]>>) {}

  async insertCommit(): Promise<never> {
    throw new Error("not used");
  }

  async latestCommittedBatches(): Promise<readonly ManualBatchSummary[]> {
    return Object.keys(this.tabs).map((tab, index) => ({
      batchId: `batch-${index}`,
      uploadId: "upload-1",
      tab,
      filename: "sample.xlsx",
      uploadedAt: "2026-08-08T10:00:00.000Z",
      rowCount: this.tabs[tab]?.length ?? 0,
      issueCount: 0,
      workbookState: "ready",
    }));
  }

  async readTabRecords(tab: string): Promise<readonly ManualStoreRecord[]> {
    return this.tabs[tab] ?? [];
  }

  async recentBatches(): Promise<readonly ManualBatchSummary[]> {
    return [];
  }
}

function contributorByDataset(store: ManualWorkbookStore, dataset: string) {
  const contributor = createManualWorkbookContributors({
    store,
    now: () => new Date("2026-08-08T12:00:00.000Z"),
  }).find((entry) => entry.dataset === dataset);
  if (!contributor) throw new Error(`missing contributor ${dataset}`);
  return contributor;
}

describe("manual workbook contributors", () => {
  it("serves marketing spend and social metrics from DB records", async () => {
    const store = new FakeStore({
      Marketing_Spend: [
        { record_id: "SPD-001", date: "2026-08-01", platform: "meta", spend_usd: 180.5 },
        { record_id: "SPD-002", date: "2026-08-02", platform: "tiktok", spend_usd: 19.5 },
      ],
      Social_Metrics: [
        {
          record_id: "SOC-001",
          snapshot_date: "2026-08-01",
          platform: "instagram",
          account: "@zacao",
          followers: 5_200,
          reach: 88_000,
          impressions: 120_000,
          engagements: 3_100,
          link_clicks: 240,
        },
      ],
    });
    const result = await contributorByDataset(store, "manual-marketing").load(context);
    const spend = result.metrics?.find(({ key }) => key === "marketing.spend");
    expect(spend?.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 20_000 } });
    expect(spend?.readiness.state).toBe("current");
    const social = result.tables?.find((table) => table.metric.key === "social.performance");
    expect(social?.rows[0]).toMatchObject({ platform: "instagram", followers: 5_200 });
    expect(result.sourceStatuses[0]).toMatchObject({ source: "manual_workbook", state: "current" });
  });

  it("maps pipeline statuses and periods onto the certified builder shapes", async () => {
    const store = new FakeStore({
      Growth_Pipeline: [
        {
          record_id: "PIPE-001",
          pipeline_type: "retail",
          opportunity: "Whole Foods NE",
          stage: "in_discussion",
          status: "open",
          value_usd: 48_000,
          next_action: "Send wholesale deck",
          next_action_date: "2026-08-15",
        },
        {
          record_id: "PIPE-002",
          pipeline_type: "grant",
          opportunity: "USDA grant",
          stage: "won",
          status: "won",
          value_usd: 15_000,
        },
      ],
      Affiliate_Ambassador_Perf: [
        {
          record_id: "AMB-001",
          period: "2026-08",
          partner_id: "P-1",
          partner_name: "Campus Crew",
          platform: "instagram",
          orders: 12,
          revenue_usd: 640,
          commission_usd: 64,
          payout_status: "pending",
        },
      ],
    });
    const result = await contributorByDataset(store, "manual-growth").load(context);
    const open = result.metrics?.find(({ key }) => key === "growth.open_pipeline");
    // Only the lowercase-"open" row counts as Open pipeline.
    expect(open?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 4_800_000 },
    });
    const partners = result.tables?.find((table) => table.metric.key === "partners.performance");
    expect(partners?.rows[0]).toMatchObject({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      partner: "Campus Crew",
      revenueMinorUnits: 64_000,
    });
  });

  it("builds operations facts with coverage flags and disclosed exclusions", async () => {
    const store = new FakeStore({
      Location_Master: [
        { location_id: "LOC-01", location_name: "SNAPL 3PL", is_active: "yes" },
        { location_id: "LOC-02", location_name: "YBYD", is_active: "yes" },
      ],
      Inventory_Snapshots: [
        {
          record_id: "SNAP-1",
          snapshot_at: "2026-08-07 06:00",
          warehouse: "SNAPL 3PL",
          sku: "SKU-01",
          on_hand: 400,
        },
        {
          record_id: "SNAP-2",
          snapshot_at: "2026-08-07 06:00",
          warehouse: "YBYD",
          sku: "SKU-01",
          on_hand: 60,
        },
      ],
      Inventory_Lots: [
        {
          record_id: "LOT-1",
          warehouse: "SNAPL 3PL",
          sku: "SKU-01",
          lot_number: "L-2026-07",
          best_by_date: "2027-01-31",
          quantity_remaining: 350,
          status: "in_stock",
        },
      ],
      Additional_Depletions: [
        {
          record_id: "DEP-1",
          movement_date: "2026-08-01",
          warehouse: "SNAPL 3PL",
          sku: "SKU-01",
          quantity: 24,
          reason: "influencer_seeding",
        },
      ],
      Production_Orders: [
        {
          record_id: "PO-2001-1",
          po_number: "PO 2001",
          sku: "SKU-01",
          units: 1_500,
          status: "in_production",
          expected_date: "2026-09-15",
        },
        {
          record_id: "PO-2002-1",
          po_number: "PO 2002",
          sku: "SKU-02",
          units: 500,
          status: "open",
          // no expected_date → excluded with disclosure
        },
      ],
    });
    const result = await contributorByDataset(store, "manual-operations").load(context);
    const combined = result.breakdowns?.find((entry) => entry.metric.key === "inventory.combined");
    expect(combined?.metric.value).toEqual({ kind: "quantity", value: 460 });
    expect(combined?.items.map(({ key }) => key)).toEqual(["SNAPL 3PL:SKU-01", "YBYD:SKU-01"]);
    const incoming = result.tables?.find((table) => table.metric.key === "production.incoming");
    expect(incoming?.metric.value).toEqual({ kind: "quantity", value: 1_500 });
    expect(incoming?.rows[0]).toMatchObject({ destinationWarehouse: "Unassigned" });
    expect(result.warnings).toContain("PRODUCTION_ROWS_WITHOUT_EXPECTED_DATE:1");
    const lots = result.tables?.find((table) => table.metric.key === "inventory.lots");
    expect(lots?.rows[0]).toMatchObject({ lotCode: "L-2026-07", quantityRemaining: 350 });
  });

  it("nulls coverage-gated metrics when required warehouses are missing", async () => {
    const store = new FakeStore({
      Location_Master: [
        { location_id: "LOC-01", location_name: "SNAPL 3PL", is_active: "yes" },
        { location_id: "LOC-02", location_name: "YBYD", is_active: "yes" },
      ],
      Inventory_Snapshots: [
        {
          record_id: "SNAP-1",
          snapshot_at: "2026-08-07 06:00",
          warehouse: "SNAPL 3PL",
          sku: "SKU-01",
          on_hand: 400,
        },
      ],
    });
    const result = await contributorByDataset(store, "manual-operations").load(context);
    const combined = result.breakdowns?.find((entry) => entry.metric.key === "inventory.combined");
    expect(combined?.metric.value).toBeNull();
    expect(combined?.metric.warnings).toContain("INVENTORY_LOCATION_COVERAGE_INCOMPLETE");
  });

  it("serves finance actuals from month periods and cash from the latest date", async () => {
    const store = new FakeStore({
      Finance_Actuals: [
        {
          record_id: "FIN-1",
          period: "2026-07",
          account_code: "6000",
          category: "Marketing",
          actual_amount_usd: 1_200,
          cash_or_accrual: "cash",
        },
        {
          record_id: "FIN-2",
          period: "2026-07",
          account_code: "7000",
          category: "Operations",
          actual_amount_usd: 800,
          cash_or_accrual: "cash",
        },
      ],
      Cash_Position: [
        { record_id: "CASH-1", as_of_date: "2026-08-01", cash_balance_usd: 52_000 },
        { record_id: "CASH-2", as_of_date: "2026-08-08", cash_balance_usd: 49_500.25 },
      ],
    });
    const result = await contributorByDataset(store, "manual-financial").load(context);
    const expenses = result.metrics?.find(({ key }) => key === "finance.actual_expenses");
    expect(expenses?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 200_000 },
    });
    const cash = result.metrics?.find(({ key }) => key === "finance.cash_position");
    expect(cash?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 4_950_025 },
    });
  });

  it("returns truthful no-activity states for an empty database", async () => {
    const store = new FakeStore({});
    const result = await contributorByDataset(store, "manual-marketing").load(context);
    const spend = result.metrics?.find(({ key }) => key === "marketing.spend");
    expect(spend?.value).toBeNull();
    expect(spend?.readiness.state).toBe("no_activity");
    expect(result.sourceStatuses[0]).toMatchObject({
      source: "manual_workbook",
      state: "no_activity",
    });
  });
});

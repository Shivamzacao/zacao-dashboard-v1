import { describe, expect, it } from "vitest";

import type {
  SheetRecord,
  SheetsTabDataSource,
  SheetsTabReadResult,
} from "@/src/application/ports/sheets-tabs";
import type { SourceStatus } from "@/src/domain/contracts";
import { createSheetsApiContributors } from "@/src/infrastructure/sheets-api/contributors";

const sourceStatus: SourceStatus = {
  source: "google_sheets",
  state: "current",
  checkedAt: "2026-08-10T12:00:00.000Z",
  lastSuccessfulAt: "2026-08-10T12:00:00.000Z",
  dataAsOf: "2026-08-10T00:00:00.000Z",
  completeness: "complete",
  warningCodes: [],
};

const context = {
  environment: "production" as const,
  dataPeriod: { startDate: "2026-07-01", endDate: "2026-08-31" },
  filters: {
    startDate: "2026-07-01",
    endDate: "2026-08-31",
    channels: [],
    productSkus: [],
    locations: [],
  },
  reportingTimeZone: "America/New_York" as const,
  currency: "USD" as const,
  sourceStatuses: [],
};

class FakeSource implements SheetsTabDataSource {
  constructor(
    private readonly records: Readonly<Record<string, readonly SheetRecord[]>>,
    private readonly examples: Readonly<Record<string, readonly SheetRecord[]>> = {},
  ) {}

  sourceStatus() {
    return sourceStatus;
  }

  async readPageTabs(
    _page: Parameters<SheetsTabDataSource["readPageTabs"]>[0],
    tabNames: readonly string[],
  ): Promise<SheetsTabReadResult> {
    return {
      tabs: Object.fromEntries(tabNames.map((tab) => [tab, this.records[tab] ?? []])),
      exampleTabs: Object.fromEntries(tabNames.map((tab) => [tab, this.examples[tab] ?? []])),
      sourceStatus,
      warnings: [],
    };
  }
}

function contributor(source: SheetsTabDataSource, dataset: string) {
  const found = createSheetsApiContributors(source).find((entry) => entry.dataset === dataset);
  if (!found) throw new Error(`Missing contributor ${dataset}`);
  return found;
}

describe("Sheets API contributors", () => {
  it("uses disclosed example customer rows only when production rows are absent", async () => {
    const source = new FakeSource(
      {},
      {
        Sales_Actuals: [
          {
            order_id: "DEMO-1",
            customer_id: "DUMMY-CUSTOMER",
            order_date: "2026-08-05",
            first_order_date: "2026-08-05",
            gross_product_sales_usd: 120,
            discounts_usd: 0,
            refunds_returns_usd: 0,
            cancellations_usd: 0,
            net_product_revenue_usd: 120,
            order_status: "paid",
            acquisition_channel: "Online Store",
            currency: "USD",
            is_test: "no",
            data_as_of: "2026-08-10",
            source_status: "example",
          },
        ],
        Channel_Mapping: [
          {
            source_system: "shopify",
            source_channel_or_name: "Online Store",
            dashboard_channel: "DTC — Site",
            effective_from: "2025-01-01",
            status: "active",
            source_status: "example",
          },
        ],
      },
    );

    const result = await contributor(source, "sheets-customers").load(context);

    expect(result.metrics?.find(({ key }) => key === "customers.active")?.value).toEqual({
      kind: "count",
      value: 1,
    });
    expect(result.metrics?.find(({ key }) => key === "customers.realized_ltv")?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 12_000 },
    });
    expect(result.sourceStatuses?.[0]).toMatchObject({
      state: "partial",
      completeness: "partial",
    });
    expect(result.warnings).toContain("SYNTHETIC_EXAMPLE_DATA");
  });

  it("uses disclosed example receiving and cost history for otherwise pending metrics", async () => {
    const source = new FakeSource(
      { Production_Orders: [{ po_number: "OPEN-1", status: "open" }] },
      {
        Production_Orders: [
          {
            po_number: "DEMO-1",
            expected_date: "2026-08-10",
            received_date: "2026-08-09",
            units: 100,
            received_units: 100,
          },
          {
            po_number: "DEMO-2",
            expected_date: "2026-08-10",
            received_date: "2026-08-12",
            units: 100,
            received_units: 80,
          },
        ],
        COGS_By_SKU: [
          {
            sku: "SKU-01",
            effective_from: "2026-05-01",
            cost_basis: "landed",
            production_cost_usd: 1.5,
            packaging_usd: 0.3,
            freight_usd: 0.2,
            total_unit_cost_usd: 2,
          },
          {
            sku: "SKU-01",
            effective_from: "2026-08-01",
            cost_basis: "landed",
            production_cost_usd: 1.35,
            packaging_usd: 0.27,
            freight_usd: 0.18,
            total_unit_cost_usd: 1.8,
          },
        ],
      },
    );

    const result = await contributor(source, "sheets-operations").load(context);

    expect(
      result.breakdowns?.find(({ metric }) => metric.key === "operations.manufacturer_otif")?.metric
        .value,
    ).toEqual({ kind: "rate_basis_points", value: 5_000 });
    expect(
      result.breakdowns?.find(({ metric }) => metric.key === "manufacturing.input_cost_movement")
        ?.metric.value,
    ).toEqual({ kind: "rate_basis_points", value: -1_000 });
    expect(result.warnings).toContain("SYNTHETIC_EXAMPLE_DATA");
  });

  it("uses disclosed operational examples only where production coverage is unusable", async () => {
    const source = new FakeSource(
      {
        Additional_Depletions: [{ movement_date: "2026-06-01", reason: "sample", quantity: 9 }],
        Production_Orders: [
          {
            po_number: "FUTURE-PO",
            sku: "SKU-01",
            units: 200,
            status: "in_production",
            expected_date: "2026-10-01",
          },
        ],
      },
      {
        Additional_Depletions: [{ movement_date: "2026-08-01", reason: "sample", quantity: 5 }],
        Production_Orders: [
          {
            record_id: "DEMO-INCOMING",
            po_number: "DEMO-INCOMING",
            sku: "SKU-01",
            units: 100,
            status: "in_production",
            expected_date: "2026-08-20",
            confirmed_date: "2026-07-10",
            production_start_date: "2026-07-12",
          },
          {
            record_id: "DEMO-RECEIVED",
            po_number: "DEMO-RECEIVED",
            sku: "SKU-01",
            units: 100,
            status: "received",
            expected_date: "2026-08-05",
            received_date: "2026-08-04",
            received_units: 100,
            accepted_units: 98,
            confirmed_date: "2026-07-01",
            production_start_date: "2026-07-03",
          },
        ],
        Warehouse_Fulfillment: [
          {
            order_id: "DEMO-WH",
            promised_ship_at: "2026-08-01T16:00:00Z",
            shipped_at: "2026-08-01T15:00:00Z",
            pick_accurate: "yes",
          },
        ],
        Packaging_Materials: [
          {
            material_id: "wrap",
            material_name: "Bar wrappers",
            ideal_minimum: 30,
            ideal_maximum: 90,
            effective_from: "2026-01-01",
            is_active: "yes",
          },
        ],
        Packaging_Inventory: [
          { snapshot_date: "2026-07-31", material_id: "wrap", on_hand_quantity: 42 },
        ],
        Packaging_Orders: [
          {
            po_number: "DEMO-PKG",
            material_id: "wrap",
            quantity: 10,
            eta: "2026-09-12",
            status: "in_transit",
          },
        ],
        Packaging_Forecast: ["08", "09", "10", "11"].map((month) => ({
          month: `2026-${month}-01`,
          material_id: "wrap",
          consumption_quantity: 10,
          status: "approved",
        })),
      },
    );

    const result = await contributor(source, "sheets-operations").load(context);

    expect(
      result.metrics?.find(({ key }) => key === "operations.manufacturer_lead_time")?.value,
    ).toEqual({ kind: "quantity", value: 34 });
    expect(
      result.metrics?.find(({ key }) => key === "operations.warehouse_on_time_accuracy")?.value,
    ).toEqual({ kind: "rate_basis_points", value: 10_000 });
    expect(
      result.breakdowns?.find(({ metric }) => metric.key === "inventory.depletions")?.metric.value,
    ).toEqual({ kind: "quantity", value: 5 });
    expect(
      result.breakdowns?.find(({ metric }) => metric.key === "inventory.packaging_projection")
        ?.metric.value,
    ).toEqual({ kind: "quantity", value: 42 });
    expect(
      result.tables?.find(({ metric }) => metric.key === "production.incoming")?.metric.value,
    ).toEqual({ kind: "quantity", value: 100 });
    expect(result.sourceStatuses[0]).toMatchObject({ state: "partial", completeness: "partial" });
    expect(result.warnings).toContain("SYNTHETIC_EXAMPLE_DATA");
  });

  it("uses an example SKU master to report production cost coverage on Product", async () => {
    const source = new FakeSource(
      {
        COGS_By_SKU: [
          {
            sku: "SKU-01",
            effective_from: "2026-07-01",
            cost_basis: "standard",
            total_unit_cost_usd: 2.5,
          },
        ],
      },
      {
        SKU_Master: [{ sku_id: "SKU-01", is_active: "yes", source_status: "example" }],
      },
    );

    const result = await contributor(source, "sheets-product").load(context);

    expect(result.metrics?.find(({ key }) => key === "quality.missing_sku_cost")?.value).toEqual({
      kind: "count",
      value: 0,
    });
    expect(result.warnings).toContain("SYNTHETIC_EXAMPLE_DATA");
  });

  it("publishes Realized LTV and aggregate PII-free cohort rows", async () => {
    const source = new FakeSource({
      Sales_Actuals: [
        {
          order_id: "O-1",
          customer_id: "C-PRIVATE",
          order_date: "2026-01-05",
          first_order_date: "2026-01-05",
          gross_product_sales_usd: 100,
          discounts_usd: 10,
          refunds_returns_usd: 0,
          cancellations_usd: 0,
          net_product_revenue_usd: 90,
          order_status: "paid",
          acquisition_channel: "Online Store",
          currency: "USD",
          is_test: "no",
          data_as_of: "2026-08-10",
        },
        {
          order_id: "O-2",
          customer_id: "C-PRIVATE",
          order_date: "2026-01-25",
          first_order_date: "2026-01-05",
          gross_product_sales_usd: 50,
          discounts_usd: 0,
          refunds_returns_usd: 0,
          cancellations_usd: 0,
          net_product_revenue_usd: 50,
          order_status: "paid",
          acquisition_channel: "Online Store",
          currency: "USD",
          is_test: "no",
          data_as_of: "2026-08-10",
        },
      ],
      Channel_Mapping: [
        {
          source_channel_or_name: "Online Store",
          dashboard_channel: "DTC (Shopify)",
          effective_from: "2025-01-01",
          status: "active",
        },
      ],
    });

    const result = await contributor(source, "sheets-customers").load(context);
    expect(result.metrics?.find(({ key }) => key === "customers.realized_ltv")?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 14_000 },
    });
    expect(result.metrics?.find(({ key }) => key === "customers.active")?.value).toEqual({
      kind: "count",
      value: 0,
    });
    const cohorts = result.tables?.find(
      ({ metric }) => metric.key === "customers.realized_ltv_cohorts",
    );
    expect(cohorts?.rows).toEqual([
      expect.objectContaining({
        cohortMonth: "2026-01",
        customerCount: 1,
        ltv30dMinorUnits: 14_000,
        lifetimeLtvMinorUnits: 14_000,
      }),
    ]);
    expect(JSON.stringify(cohorts?.rows)).not.toContain("C-PRIVATE");
  });

  it("values latest on-hand inventory while keeping low inventory in Phase 2", async () => {
    const source = new FakeSource({
      Inventory_Snapshots: [
        {
          snapshot_at: "2026-08-01 06:00",
          warehouse: "SNAPL 3PL",
          sku: "SKU-01",
          on_hand: 1_240,
          available: 250,
        },
        {
          snapshot_at: "2026-08-01 06:00",
          warehouse: "YBYD",
          sku: "SKU-02",
          on_hand: 860,
          available: 770,
        },
        {
          snapshot_at: "2026-08-01 06:00",
          warehouse: "YBYD",
          sku: "SKU-02",
          on_hand: 860,
          available: 770,
        },
      ],
      COGS_By_SKU: [
        {
          sku: "SKU-01",
          effective_from: "2026-07-01",
          cost_basis: "landed",
          total_unit_cost_usd: 2.5,
        },
        {
          sku: "SKU-02",
          effective_from: "2026-07-01",
          cost_basis: "landed",
          total_unit_cost_usd: 2.15,
        },
      ],
      Metric_Targets: [
        {
          metric_key: "inventory.reorder_point",
          period_start: "2026-07-01",
          period_end: "2026-08-31",
          target_value: 1_300,
          scope_type: "sku",
          scope_value: "SKU-01",
          status: "active",
        },
        {
          metric_key: "inventory.reorder_point",
          period_start: "2026-07-01",
          period_end: "2026-08-31",
          target_value: 800,
          scope_type: "sku",
          scope_value: "SKU-02",
          status: "active",
        },
      ],
      SKU_Master: [
        { sku_id: "SKU-01", is_active: "yes" },
        { sku_id: "SKU-02", is_active: "yes" },
      ],
    });
    const product = await contributor(source, "sheets-product").load(context);
    expect(product.metrics?.find(({ key }) => key === "inventory.value")?.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 494_900 },
    });
    expect(product.metrics?.find(({ key }) => key === "quality.missing_sku_cost")?.value).toEqual({
      kind: "count",
      value: 0,
    });
    const insights = await contributor(source, "sheets-insights").load(context);
    const alert = insights.breakdowns?.find(({ metric }) => metric.key === "alerts.low_inventory");
    expect(alert?.metric.value).toBeNull();
    expect(alert?.metric.warnings).toContain("PHASE_2_NOT_CONFIGURED");
    expect(alert?.items).toEqual([]);
  });

  it("keeps a missing depletions tab empty while serving valid operations data", async () => {
    const source = new FakeSource({
      Location_Master: [{ location_name: "SNAPL 3PL", is_active: "yes" }],
      Inventory_Snapshots: [
        { snapshot_at: "2026-08-01 06:00", warehouse: "SNAPL 3PL", sku: "SKU-01", on_hand: 1_240 },
      ],
      Production_Orders: [
        {
          record_id: "PO-1",
          po_number: "PO 1",
          sku: "SKU-01",
          units: 1_500,
          status: "in_production",
          expected_date: "2026-08-15",
          unit_cost_usd: 2.35,
          freight_usd: 1_800,
        },
      ],
    });
    const result = await contributor(source, "sheets-operations").load(context);
    expect(
      result.breakdowns?.find(({ metric }) => metric.key === "inventory.combined")?.metric.value,
    ).toEqual({ kind: "quantity", value: 1_240 });
    expect(
      result.breakdowns?.find(({ metric }) => metric.key === "inventory.depletions")?.metric.value,
    ).toBeNull();
    expect(
      result.tables?.find(({ metric }) => metric.key === "production.incoming")?.rows,
    ).toHaveLength(1);
  });

  it("keeps undated incoming units in the headline and sorts blank lot dates last", async () => {
    const source = new FakeSource({
      Location_Master: [{ location_name: "SNAPL 3PL", is_active: "yes" }],
      Inventory_Snapshots: [
        { snapshot_at: "2026-08-01 06:00", warehouse: "SNAPL 3PL", sku: "SKU-01", on_hand: 10 },
      ],
      Inventory_Lots: [
        {
          warehouse: "SNAPL 3PL",
          sku: "SKU-01",
          lot_number: "UNDATED",
          best_by_date: null,
          quantity_remaining: 4,
        },
        {
          warehouse: "SNAPL 3PL",
          sku: "SKU-01",
          lot_number: "DATED",
          best_by_date: "2026-12-01",
          quantity_remaining: 6,
        },
      ],
      Production_Orders: [
        {
          record_id: "PO-UNDATED",
          po_number: "PO 2",
          sku: "SKU-01",
          units: 500,
          status: "open",
          expected_date: null,
          unit_cost_usd: 2,
        },
      ],
    });
    const result = await contributor(source, "sheets-operations").load(context);
    const incoming = result.tables?.find(({ metric }) => metric.key === "production.incoming");
    expect(incoming?.metric.value).toEqual({ kind: "quantity", value: 500 });
    expect(incoming?.rows[0]).toMatchObject({ expectedArrivalDate: null });
    expect(result.warnings).toContain("PRODUCTION_ROWS_WITHOUT_EXPECTED_DATE:1");
    const lots = result.tables?.find(({ metric }) => metric.key === "inventory.lots");
    expect(lots?.rows.map((row) => row["lotCode"])).toEqual(["DATED", "UNDATED"]);
  });

  it("publishes production cost and payment exposure on the financial page", async () => {
    const source = new FakeSource({
      Production_Orders: [
        {
          po_number: "PO 3",
          units: 100,
          unit_cost_usd: 2.5,
          freight_usd: 40,
        },
      ],
    });

    const result = await contributor(source, "sheets-financial").load(context);
    expect(
      result.breakdowns?.find(({ metric }) => metric.key === "production.cost_payment")?.metric
        .value,
    ).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 29_000 } });
  });
});

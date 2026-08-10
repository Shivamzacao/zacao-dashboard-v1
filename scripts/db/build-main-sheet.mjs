// Builds the plain "main sheet" workbook: only the tabs the live code
// actually reads today (per contracts.generated.ts), each with just a
// header row and a few realistic dummy rows. No template styling — this
// file is meant to be the real, reusable input for both the manual /import
// upload flow and, later, the Google Sheets sync.
//
// Usage: node scripts/db/build-main-sheet.mjs [outputPath]
import path from "node:path";
import process from "node:process";
import ExcelJS from "exceljs";

import { MANUAL_TAB_CONTRACTS } from "../../src/infrastructure/manual-workbook/contracts.generated.ts";

const outputPath = process.argv[2] ?? path.join(process.cwd(), "outputs/zacao-main-sheet.xlsx");

const TABS = [
  "Location_Master",
  "Inventory_Snapshots",
  "Inventory_Lots",
  "Additional_Depletions",
  "Production_Orders",
  "COGS_By_SKU",
  "Metric_Targets",
  "Sales_Forecast",
  "Finance_Actuals",
  "Cash_Position",
  "Marketing_Spend",
  "Social_Metrics",
  "Growth_Pipeline",
  "Affiliate_Ambassador_Perf",
];

// Dummy rows keyed by column name; every row is explicitly source_status =
// production so the import flow accepts it as real data (not draft/example).
const ROWS = {
  Location_Master: [
    { location_id: "LOC-01", location_name: "SNAPL 3PL", location_type: "3PL", is_active: "yes" },
    { location_id: "LOC-02", location_name: "YBYD", location_type: "warehouse", is_active: "yes" },
    {
      location_id: "LOC-03",
      location_name: "139 North 10th Street",
      location_type: "warehouse",
      is_active: "yes",
    },
  ],
  Inventory_Snapshots: [
    {
      record_id: "SNAP-001",
      snapshot_at: "2026-08-01 06:00",
      warehouse: "SNAPL 3PL",
      sku: "SKU-01",
      on_hand: 1_240,
      committed: 180,
      available: 1_060,
      damaged: 0,
      incoming: 1_500,
    },
    {
      record_id: "SNAP-002",
      snapshot_at: "2026-08-01 06:00",
      warehouse: "YBYD",
      sku: "SKU-02",
      on_hand: 860,
      committed: 90,
      available: 770,
      damaged: 0,
      incoming: 0,
    },
    {
      record_id: "SNAP-003",
      snapshot_at: "2026-08-01 06:00",
      warehouse: "139 North 10th Street",
      sku: "SKU-01",
      on_hand: 95,
      committed: 5,
      available: 90,
      damaged: 0,
      incoming: 0,
    },
  ],
  Inventory_Lots: [
    {
      record_id: "LOT-001",
      warehouse: "SNAPL 3PL",
      sku: "SKU-01",
      lot_number: "L-2026-06-A",
      production_date: "2026-06-10",
      received_date: "2026-06-28",
      best_by_date: "2027-06-10",
      quantity_received: 1_500,
      quantity_remaining: 1_240,
      status: "in_stock",
    },
  ],
  Additional_Depletions: [
    {
      record_id: "DEP-001",
      movement_date: "2026-07-12",
      warehouse: "SNAPL 3PL",
      sku: "SKU-01",
      quantity: 48,
      reason: "influencer_seeding",
      recipient_or_project: "Summer creator push",
    },
  ],
  Production_Orders: [
    {
      record_id: "PO-001",
      po_number: "PO 2001",
      sku: "SKU-01",
      units: 1_500,
      supplier: "Fairafric",
      order_date: "2026-06-01",
      expected_date: "2026-09-15",
      status: "in_production",
      unit_cost_usd: 2.35,
      freight_usd: 1_800,
      deposit_usd: 1_762.5,
      balance_usd: 1_762.5,
      payment_due_date: "2026-09-01",
    },
  ],
  COGS_By_SKU: [
    {
      record_id: "COGS-001",
      sku: "SKU-01",
      effective_from: "2026-07-01",
      cost_basis: "standard",
      production_cost_usd: 1.85,
      packaging_usd: 0.3,
      freight_usd: 0.2,
      fulfillment_usd: 0.15,
      total_unit_cost_usd: 2.5,
    },
    {
      record_id: "COGS-002",
      sku: "SKU-02",
      effective_from: "2026-07-01",
      cost_basis: "standard",
      production_cost_usd: 1.6,
      packaging_usd: 0.25,
      freight_usd: 0.18,
      fulfillment_usd: 0.12,
      total_unit_cost_usd: 2.15,
    },
  ],
  Metric_Targets: [
    {
      record_id: "MT-001",
      metric_key: "commerce.net_sales",
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      target_value: 15_000,
      unit: "usd",
      scope_type: "company",
      status: "active",
    },
    {
      record_id: "MT-002",
      metric_key: "inventory.reorder_point",
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      target_value: 300,
      unit: "units",
      scope_type: "sku",
      scope_value: "SKU-01",
      status: "active",
    },
  ],
  Sales_Forecast: [
    {
      record_id: "FCST-001",
      forecast_version: "2026-08 v1",
      week_start: "2026-07-27",
      sku: "SKU-01",
      channel: "DTC (Shopify)",
      forecast_units: 420,
      forecast_revenue_usd: 5_040,
      status: "approved",
    },
    {
      record_id: "FCST-002",
      forecast_version: "2026-08 v1",
      week_start: "2026-07-27",
      sku: "SKU-02",
      channel: "DTC (Shopify)",
      forecast_units: 260,
      forecast_revenue_usd: 3_120,
      status: "approved",
    },
  ],
  Finance_Actuals: [
    {
      record_id: "FIN-001",
      period: "2026-07",
      account_code: "6000",
      category: "Marketing",
      actual_amount_usd: 2_490.5,
      cash_or_accrual: "cash",
      status: "posted",
    },
    {
      record_id: "FIN-002",
      period: "2026-07",
      account_code: "7000",
      category: "Operations",
      actual_amount_usd: 4_120,
      cash_or_accrual: "cash",
      status: "posted",
    },
  ],
  Cash_Position: [
    {
      record_id: "CASH-001",
      as_of_date: "2026-08-01",
      cash_balance_usd: 56_950.25,
      restricted_cash_usd: 0,
      expected_inflow_usd: 12_000,
      expected_outflow_usd: 18_500,
      due_date: "2026-09-01",
    },
  ],
  Marketing_Spend: [
    {
      record_id: "SPD-001",
      date: "2026-07-05",
      platform: "meta",
      account: "ZACAO Main",
      campaign_name: "Summer prospecting",
      spend_usd: 1_850,
      impressions: 412_000,
      clicks: 8_600,
      conversions: 132,
    },
  ],
  Social_Metrics: [
    {
      record_id: "SOC-001",
      snapshot_date: "2026-07-31",
      platform: "instagram",
      account: "@zacaochocolate",
      followers: 12_480,
      reach: 96_000,
      impressions: 141_000,
      engagements: 4_820,
      link_clicks: 610,
    },
  ],
  Growth_Pipeline: [
    {
      record_id: "PIPE-001",
      pipeline_type: "retail",
      opportunity: "Whole Foods NE region",
      stage: "in_discussion",
      status: "open",
      value_usd: 48_000,
      probability_manual: 0.3,
      created_date: "2026-06-14",
      next_action: "Send wholesale deck",
      next_action_date: "2026-08-15",
    },
  ],
  Affiliate_Ambassador_Perf: [
    {
      record_id: "AMB-001",
      period: "2026-07",
      partner_id: "PART-01",
      partner_name: "Campus Crew NYC",
      platform: "campus",
      code_or_link: "ZACAO-CAMPUS",
      orders: 34,
      revenue_usd: 1_620,
      commission_usd: 162,
      payout_status: "pending",
    },
  ],
};

const workbook = new ExcelJS.Workbook();
let totalRows = 0;

for (const tabName of TABS) {
  const contract = MANUAL_TAB_CONTRACTS[tabName];
  if (!contract) throw new Error(`No contract found for tab: ${tabName}`);
  const sheet = workbook.addWorksheet(tabName);
  const headers = contract.columns.map((column) => column.header);
  sheet.addRow(headers);

  const rows = ROWS[tabName] ?? [];
  for (const row of rows) {
    sheet.addRow(
      headers.map((header) => {
        if (header === "source_status") return "production";
        if (header === "data_as_of") return row[header] ?? "2026-08-10";
        if (header === "updated_by") return "main-sheet-generator";
        return row[header] ?? null;
      }),
    );
  }
  totalRows += rows.length;
}

await workbook.xlsx.writeFile(outputPath);
console.log(`Built ${TABS.length} tabs, ${totalRows} dummy rows.`);
console.log(`Output: ${path.relative(process.cwd(), outputPath)}`);

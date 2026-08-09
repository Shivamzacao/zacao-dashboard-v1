// Builds a sample input workbook with a few production rows so the import
// flow and the workbook-fed dashboard metrics can be exercised end to end.
// The real workbook ships with header-only data tabs.
//
// Usage: node scripts/db/make-sample-workbook.mjs [outputPath]
import path from "node:path";
import process from "node:process";
import ExcelJS from "exceljs";

const FIXTURE = path.join(
  process.cwd(),
  "tests/fixtures/manual-workbook/ZACAO_Dashboard_V1_Input_Workbook.xlsx",
);
const outputPath =
  process.argv[2] ?? path.join(process.cwd(), "outputs/manual-workbook-sample.xlsx");

// Values keyed by column name; every row is explicitly source_status=production.
const SAMPLE_ROWS = {
  Marketing_Spend: [
    {
      record_id: "SPD-2026-07-META-001",
      date: "2026-07-05",
      platform: "meta",
      account: "ZACAO Main",
      campaign_name: "Summer prospecting",
      spend_usd: 1_850.0,
      impressions: 412_000,
      clicks: 8_600,
      conversions: 132,
    },
    {
      record_id: "SPD-2026-07-TIKTOK-001",
      date: "2026-07-19",
      platform: "tiktok",
      account: "ZACAO Main",
      campaign_name: "Creator seeding",
      spend_usd: 640.5,
      impressions: 210_000,
      clicks: 5_100,
      conversions: 44,
    },
  ],
  Social_Metrics: [
    {
      record_id: "SOC-2026-07-IG",
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
  Inventory_Snapshots: [
    {
      record_id: "SNAP-2026-08-01-SNAPL-01",
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
      record_id: "SNAP-2026-08-01-SNAPL-02",
      snapshot_at: "2026-08-01 06:00",
      warehouse: "SNAPL 3PL",
      sku: "SKU-02",
      on_hand: 860,
      committed: 90,
      available: 770,
      damaged: 0,
      incoming: 0,
    },
    {
      record_id: "SNAP-2026-08-01-YBYD-01",
      snapshot_at: "2026-08-01 06:00",
      warehouse: "YBYD",
      sku: "SKU-01",
      on_hand: 320,
      committed: 0,
      available: 320,
      damaged: 0,
      incoming: 0,
    },
    {
      record_id: "SNAP-2026-08-01-139-01",
      snapshot_at: "2026-08-01 06:00",
      warehouse: "139 North 10th Street",
      sku: "SKU-01",
      on_hand: 95,
      committed: 5,
      available: 90,
      damaged: 0,
      incoming: 0,
    },
    {
      record_id: "SNAP-2026-08-01-TRANSIT-01",
      snapshot_at: "2026-08-01 06:00",
      warehouse: "In Transit",
      sku: "SKU-02",
      on_hand: 400,
      committed: 0,
      available: 0,
      damaged: 0,
      incoming: 400,
    },
    {
      record_id: "SNAP-2026-08-01-OTHER-01",
      snapshot_at: "2026-08-01 06:00",
      warehouse: "Other",
      sku: "SKU-03",
      on_hand: 40,
      committed: 0,
      available: 40,
      damaged: 0,
      incoming: 0,
    },
  ],
  Inventory_Lots: [
    {
      record_id: "LOT-2026-06-SKU01",
      warehouse: "SNAPL 3PL",
      sku: "SKU-01",
      lot_number: "L-2026-06-A",
      production_date: "2026-06-10",
      received_date: "2026-06-28",
      best_by_date: "2027-06-10",
      quantity_received: 1_500,
      quantity_remaining: 1_240,
      status: "in_stock",
      data_as_of: "2026-08-01",
    },
  ],
  Additional_Depletions: [
    {
      record_id: "DEP-2026-07-001",
      movement_date: "2026-07-12",
      warehouse: "SNAPL 3PL",
      sku: "SKU-01",
      quantity: 48,
      reason: "influencer_seeding",
      recipient_or_project: "Summer creator push",
    },
    {
      record_id: "DEP-2026-07-002",
      movement_date: "2026-07-22",
      warehouse: "139 North 10th Street",
      sku: "SKU-02",
      quantity: 12,
      reason: "sample",
      recipient_or_project: "Retail buyer meeting",
    },
  ],
  Production_Orders: [
    {
      record_id: "PO-2001-L1",
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
      last_activity_date: "2026-08-01",
      next_action: "Send wholesale deck",
      next_action_date: "2026-08-15",
    },
    {
      record_id: "PIPE-002",
      pipeline_type: "partnership",
      opportunity: "Specialty coffee collab",
      stage: "proposal_sent",
      status: "open",
      value_usd: 12_500,
      probability_manual: 0.45,
      created_date: "2026-07-02",
      next_action: "Follow up on sampling",
      next_action_date: "2026-08-20",
    },
  ],
  Affiliate_Ambassador_Perf: [
    {
      record_id: "AMB-2026-07-001",
      period: "2026-07",
      partner_id: "PART-01",
      partner_name: "Campus Crew NYC",
      platform: "campus",
      code_or_link: "ZACAO-CAMPUS",
      orders: 34,
      revenue_usd: 1_620.0,
      commission_usd: 162.0,
      posts: 6,
      reach: 22_000,
      clicks: 780,
      payout_status: "pending",
    },
  ],
  Finance_Actuals: [
    {
      record_id: "FIN-2026-07-6000",
      period: "2026-07",
      account_code: "6000",
      category: "Marketing",
      actual_amount_usd: 2_490.5,
      cash_or_accrual: "cash",
      status: "posted",
    },
    {
      record_id: "FIN-2026-07-7000",
      period: "2026-07",
      account_code: "7000",
      category: "Operations",
      actual_amount_usd: 4_120.0,
      cash_or_accrual: "cash",
      status: "posted",
    },
    {
      record_id: "FIN-2026-07-8000",
      period: "2026-07",
      account_code: "8000",
      category: "Staffing",
      actual_amount_usd: 9_800.0,
      cash_or_accrual: "accrual",
      status: "posted",
    },
  ],
  Cash_Position: [
    {
      record_id: "CASH-2026-07-31",
      as_of_date: "2026-07-31",
      cash_balance_usd: 58_400.0,
      restricted_cash_usd: 0,
      expected_inflow_usd: 12_000,
      expected_outflow_usd: 18_500,
      due_date: "2026-09-01",
    },
    {
      record_id: "CASH-2026-08-01",
      as_of_date: "2026-08-01",
      cash_balance_usd: 56_950.25,
      restricted_cash_usd: 0,
      expected_inflow_usd: 12_000,
      expected_outflow_usd: 18_500,
      due_date: "2026-09-01",
    },
  ],
};

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(FIXTURE);

let written = 0;
for (const [tabName, rows] of Object.entries(SAMPLE_ROWS)) {
  const sheet = workbook.getWorksheet(tabName);
  if (!sheet) throw new Error(`Sheet not found in fixture workbook: ${tabName}`);
  const headers = (sheet.getRow(1).values ?? [])
    .slice(1)
    .map((value) => String(value ?? "").trim());
  for (const [index, row] of rows.entries()) {
    const values = headers.map((header) => {
      if (header === "source_status") return "production";
      if (header === "data_as_of") return row[header] ?? "2026-08-08";
      if (header === "updated_by") return "sample-generator";
      return row[header] ?? null;
    });
    sheet.getRow(index + 2).values = values;
  }
  written += rows.length;
}

await workbook.xlsx.writeFile(outputPath);
console.log(
  `wrote ${written} sample production rows across ${Object.keys(SAMPLE_ROWS).length} tabs`,
);
console.log(`output: ${path.relative(process.cwd(), outputPath)}`);

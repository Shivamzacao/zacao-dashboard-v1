export type GoogleCell = string | number | boolean | null;
export type GoogleRecord = Readonly<Record<string, GoogleCell>>;

export type ColumnKind = "text" | "date" | "number" | "integer" | "boolean";

export interface ColumnContract {
  readonly header: string;
  readonly kind: ColumnKind;
  readonly required: boolean;
  readonly enumValues?: readonly string[];
  readonly minimum?: number;
  readonly exclusiveMinimum?: number;
}

export interface TabContract {
  readonly name: ApprovedInputTab;
  readonly columns: readonly ColumnContract[];
  readonly businessKey: readonly string[] | "exact-row";
}

const channels = [
  "Website/DTC",
  "Affiliate/ShopMy",
  "TikTok Shop",
  "IG Shop",
  "In-store/cafés",
  "Wholesale/Faire",
  "Events/pop-ups",
  "Unclassified",
] as const;

const text = (header: string, required = false): ColumnContract => ({
  header,
  kind: "text",
  required,
});
const date = (header: string, required = false): ColumnContract => ({
  header,
  kind: "date",
  required,
});
const number = (
  header: string,
  required = false,
  minimum?: number,
  exclusiveMinimum?: number,
): ColumnContract => ({
  header,
  kind: "number",
  required,
  ...(minimum === undefined ? {} : { minimum }),
  ...(exclusiveMinimum === undefined ? {} : { exclusiveMinimum }),
});
const integer = (header: string, required = false, minimum?: number): ColumnContract => ({
  header,
  kind: "integer",
  required,
  ...(minimum === undefined ? {} : { minimum }),
});
const enumColumn = (
  header: string,
  values: readonly string[],
  required = false,
): ColumnContract => ({ header, kind: "text", required, enumValues: values });

export const APPROVED_INPUT_TABS = [
  "Mappings",
  "Inventory",
  "Inventory_Lots",
  "Depletions",
  "Forecast",
  "Production",
  "SKU_Costs",
  "Finance_Actuals",
  "Cash",
  "Marketing_Spend",
  "Social_Metrics",
  "Partner_Performance",
  "Growth_Pipeline",
  "Rules_Targets",
] as const;

export type ApprovedInputTab = (typeof APPROVED_INPUT_TABS)[number];

export const APPROVED_TAB_CONTRACTS: Readonly<Record<ApprovedInputTab, TabContract>> = {
  Mappings: {
    name: "Mappings",
    columns: [
      enumColumn("Mapping Type", ["SKU", "CHANNEL", "WAREHOUSE"], true),
      enumColumn("Source System", ["Shopify", "Klaviyo", "Budget", "S&OP", "Manual"], true),
      text("Source Value", true),
      text("Maps To", true),
      number("Units per Sellable Unit"),
      enumColumn("S&OP Channel", [
        "DTC/Website",
        "TikTok Shop",
        "Instagram Shop",
        "Retail",
        "Events/pop-ups",
        "Unclassified",
      ]),
      date("Effective From", true),
      text("Notes"),
    ],
    businessKey: ["Mapping Type", "Source System", "Source Value", "Effective From"],
  },
  Inventory: {
    name: "Inventory",
    columns: [
      date("Date", true),
      text("Warehouse", true),
      text("SKU", true),
      enumColumn("Inventory Type", ["System", "Physical"], true),
      number("Quantity On Hand", true, 0),
      number("Quantity Available", false, 0),
      text("Notes"),
    ],
    businessKey: ["Date", "Warehouse", "SKU", "Inventory Type"],
  },
  Inventory_Lots: {
    name: "Inventory_Lots",
    columns: [
      date("As Of Date", true),
      text("Warehouse", true),
      text("SKU", true),
      text("Lot Code", true),
      date("Best By Date", true),
      number("Quantity Remaining", true, 0),
      date("Production Date"),
      date("Receipt Date"),
      enumColumn("Status", ["Available", "Hold", "Depleted", "Expired"]),
      text("Notes"),
    ],
    businessKey: ["Warehouse", "SKU", "Lot Code"],
  },
  Depletions: {
    name: "Depletions",
    columns: [
      date("Date", true),
      text("Warehouse", true),
      text("SKU", true),
      number("Quantity", true, undefined, 0),
      enumColumn(
        "Reason",
        ["Gifting", "Sample", "Influencer", "Promotion", "Damage", "Wastage", "Other"],
        true,
      ),
      text("Lot Code"),
      text("Recipient or Project"),
      text("Notes"),
    ],
    businessKey: "exact-row",
  },
  Forecast: {
    name: "Forecast",
    columns: [
      text("Forecast Version", true),
      date("Version Date", true),
      enumColumn("Status", ["Draft", "Active", "Superseded"], true),
      date("Week Start", true),
      text("SKU", true),
      enumColumn("Dashboard Channel", channels, true),
      number("Forecast Units", true, 0),
      number("Forecast Revenue USD", true, 0),
      text("Notes"),
    ],
    businessKey: ["Forecast Version", "Week Start", "SKU", "Dashboard Channel"],
  },
  Production: {
    name: "Production",
    columns: [
      text("PO Number", true),
      text("PO Line", true),
      text("SKU", true),
      number("Units Ordered", true, undefined, 0),
      date("Order Date", true),
      date("Expected Arrival Date", true),
      text("Destination Warehouse", true),
      enumColumn(
        "Status",
        [
          "Planned",
          "Ordered",
          "In Production",
          "In Transit",
          "Partially Received",
          "Received",
          "Delayed",
          "Cancelled",
        ],
        true,
      ),
      date("Expected Production Date"),
      date("Actual Arrival Date"),
      number("Units Received", false, 0),
      number("Unit Cost USD", false, 0),
      number("Freight USD", false, 0),
      date("Deposit Due Date"),
      number("Deposit Amount USD", false, 0),
      date("Balance Due Date"),
      number("Balance Amount USD", false, 0),
      { header: "Rebate Eligible", kind: "boolean", required: false },
      text("Notes"),
    ],
    businessKey: ["PO Number", "PO Line"],
  },
  SKU_Costs: {
    name: "SKU_Costs",
    columns: [
      date("Effective From", true),
      text("SKU", true),
      number("Cost per Unit USD", true, 0),
      date("Effective To"),
      text("Cost Reference"),
      text("Notes"),
    ],
    businessKey: ["SKU", "Effective From"],
  },
  Finance_Actuals: {
    name: "Finance_Actuals",
    columns: [
      date("Date", true),
      enumColumn(
        "Category",
        [
          "Payroll",
          "Contractor",
          "Marketing",
          "Fulfillment",
          "Warehouse",
          "Production",
          "Freight",
          "Other Operating Expense",
        ],
        true,
      ),
      number("Amount USD", true),
      text("Description"),
      text("Reference"),
    ],
    businessKey: "exact-row",
  },
  Cash: {
    name: "Cash",
    columns: [
      date("Date", true),
      text("Account", true),
      number("Balance USD", true),
      number("Restricted Cash USD", false, 0),
      text("Notes"),
    ],
    businessKey: ["Date", "Account"],
  },
  Marketing_Spend: {
    name: "Marketing_Spend",
    columns: [
      date("Date", true),
      enumColumn("Platform", ["Meta", "Google", "TikTok", "Klaviyo", "ShopMy", "Other"], true),
      text("Campaign", true),
      number("Spend USD", true, 0),
      enumColumn("Dashboard Channel", channels),
      integer("Impressions", false, 0),
      integer("Clicks", false, 0),
    ],
    businessKey: ["Date", "Platform", "Campaign"],
  },
  Social_Metrics: {
    name: "Social_Metrics",
    columns: [
      date("Date", true),
      enumColumn(
        "Platform",
        ["Instagram", "TikTok", "Facebook", "LinkedIn", "YouTube", "Other"],
        true,
      ),
      text("Account", true),
      integer("Followers", true, 0),
      integer("Impressions", false, 0),
      integer("Reach", false, 0),
      integer("Engagements", false, 0),
      integer("Link Clicks", false, 0),
    ],
    businessKey: ["Date", "Platform", "Account"],
  },
  Partner_Performance: {
    name: "Partner_Performance",
    columns: [
      date("Period Start", true),
      date("Period End", true),
      enumColumn("Partner Type", ["Affiliate", "Ambassador", "Creator"], true),
      text("Partner", true),
      enumColumn("Platform", ["ShopMy", "Shopify", "Manual", "Other"], true),
      integer("Orders", false, 0),
      number("Revenue USD", false, 0),
      number("Commission USD", false, 0),
      enumColumn("Payout Status", ["Not Due", "Due", "Paid", "Disputed", "Not Applicable"]),
    ],
    businessKey: ["Period Start", "Period End", "Partner Type", "Partner", "Platform"],
  },
  Growth_Pipeline: {
    name: "Growth_Pipeline",
    columns: [
      enumColumn(
        "Pipeline Type",
        ["Collaboration", "Retail", "Partnership", "Investor", "Grant", "Sponsorship"],
        true,
      ),
      text("Opportunity ID", true),
      text("Opportunity Name", true),
      text("Stage", true),
      enumColumn("Status", ["Open", "Won", "Lost", "On Hold", "Cancelled"], true),
      date("Last Updated", true),
      number("Value USD", false, 0),
      text("Next Action"),
      date("Due Date"),
      text("Notes"),
    ],
    businessKey: ["Pipeline Type", "Opportunity ID"],
  },
  Rules_Targets: {
    name: "Rules_Targets",
    columns: [
      text("Rule Key", true),
      number("Value", true),
      enumColumn("Unit", ["Number", "Percent", "USD", "Days", "Units"], true),
      date("Effective From", true),
      text("SKU"),
      text("Warehouse"),
      enumColumn("Dashboard Channel", channels),
      date("Effective To"),
      text("Notes"),
    ],
    businessKey: ["Rule Key", "SKU", "Warehouse", "Dashboard Channel", "Effective From"],
  },
};

export const APPROVED_WORKBOOK_TAB_ORDER = ["README", ...APPROVED_INPUT_TABS] as const;

export function columnLetter(columnCount: number): string {
  let value = columnCount;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

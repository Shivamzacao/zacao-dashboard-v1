// Generates the manual-workbook tab contracts and the initial SQL migration
// from the pristine input workbook's own Data_Dictionary and Lists tabs.
//
// Usage: node scripts/db/generate-contracts.mjs
// Outputs (checked in; a drift-guard test regenerates and diffs):
//   src/infrastructure/manual-workbook/contracts.generated.ts
//   scripts/db/migrations/0001_init.sql
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import ExcelJS from "exceljs";

const projectRoot = process.cwd();
const FIXTURE = path.join(
  projectRoot,
  "tests/fixtures/manual-workbook/ZACAO_Dashboard_V1_Input_Workbook.xlsx",
);
const CONTRACTS_OUT = path.join(
  projectRoot,
  "src/infrastructure/manual-workbook/contracts.generated.ts",
);
const MIGRATION_OUT = path.join(projectRoot, "scripts/db/migrations/0001_init.sql");

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const KIND_BY_DICTIONARY_TYPE = {
  text: "text",
  date: "date",
  timestamp: "timestamp",
  int: "integer",
  usd: "usd",
  decimal: "decimal",
  pct: "percent",
};
const SQL_TYPE_BY_KIND = {
  text: "text",
  date: "date",
  timestamp: "timestamp",
  integer: "integer",
  usd: "numeric(14,2)",
  decimal: "numeric",
  percent: "numeric(7,4)",
};
const BUSINESS_KEY_BY_TAB = {
  SKU_Master: ["sku_id"],
  Location_Master: ["location_id"],
  Source_Registry: ["source_id"],
};

function cellText(row, index) {
  const value = row.values[index];
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && value !== null && "richText" in value) {
    return value.richText.map((part) => part.text).join("");
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(FIXTURE);

// ---- Controlled lists ------------------------------------------------------
const listsSheet = workbook.getWorksheet("Lists");
if (!listsSheet) throw new Error("Lists worksheet is missing from the fixture workbook");
const listHeaders = [];
listsSheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
  listHeaders.push({ column, name: String(cell.value).trim() });
});
const controlledLists = {};
for (const { column, name } of listHeaders) {
  const values = [];
  listsSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const value = cellText(row, column);
    if (value !== null) values.push(value);
  });
  controlledLists[name] = values;
}

// ---- Data dictionary → tab contracts ---------------------------------------
const dictionary = workbook.getWorksheet("Data_Dictionary");
if (!dictionary) throw new Error("Data_Dictionary worksheet is missing");
const tabs = new Map();
dictionary.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return;
  const tab = cellText(row, 1);
  if (!tab) return;
  const column = cellText(row, 3);
  const dataType = cellText(row, 4);
  const required = cellText(row, 5) === "required";
  const controlledList = cellText(row, 6);
  const allowedValues = cellText(row, 7);

  const kind = KIND_BY_DICTIONARY_TYPE[dataType];
  if (!kind) throw new Error(`Unknown data_type '${dataType}' for ${tab}.${column}`);
  if (!IDENTIFIER.test(column)) throw new Error(`Unsafe column identifier: ${tab}.${column}`);

  let enumValues = null;
  if (controlledList) {
    const values = controlledLists[controlledList];
    if (!values || values.length === 0) {
      throw new Error(`Controlled list '${controlledList}' for ${tab}.${column} is empty`);
    }
    enumValues = values;
  } else if (allowedValues) {
    enumValues = allowedValues.split(",").map((value) => value.trim());
  }

  if (!tabs.has(tab)) tabs.set(tab, []);
  tabs.get(tab).push({ header: column, kind, required, enumValues });
});

const tabNames = [...tabs.keys()];
for (const tab of tabNames) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(tab)) throw new Error(`Unsafe tab name: ${tab}`);
}

// ---- contracts.generated.ts -------------------------------------------------
const banner = `// GENERATED FILE — do not edit by hand.
// Source of truth: tests/fixtures/manual-workbook/ZACAO_Dashboard_V1_Input_Workbook.xlsx
// (Data_Dictionary + Lists tabs). Regenerate with: node scripts/db/generate-contracts.mjs
`;

const tabContractLiterals = tabNames
  .map((tab) => {
    const columns = tabs
      .get(tab)
      .map((column) => {
        const enumPart = column.enumValues
          ? `, enumValues: ${JSON.stringify(column.enumValues)}`
          : "";
        return `      { header: ${JSON.stringify(column.header)}, kind: ${JSON.stringify(column.kind)}, required: ${column.required}${enumPart} },`;
      })
      .join("\n");
    const businessKey = JSON.stringify(BUSINESS_KEY_BY_TAB[tab] ?? ["record_id"]);
    return `  ${tab}: {
    name: ${JSON.stringify(tab)},
    tableName: ${JSON.stringify(tab.toLowerCase())},
    businessKey: ${businessKey},
    columns: [
${columns}
    ],
  },`;
  })
  .join("\n");

const contractsSource = `${banner}
export type ManualColumnKind =
  | "text"
  | "date"
  | "timestamp"
  | "integer"
  | "usd"
  | "decimal"
  | "percent";

export interface ManualColumnContract {
  readonly header: string;
  readonly kind: ManualColumnKind;
  readonly required: boolean;
  readonly enumValues?: readonly string[];
}

export interface ManualTabContract {
  readonly name: string;
  readonly tableName: string;
  readonly businessKey: readonly string[];
  readonly columns: readonly ManualColumnContract[];
}

export const MANUAL_WORKBOOK_TABS = ${JSON.stringify(tabNames, null, 2)} as const;

export type ManualWorkbookTab = (typeof MANUAL_WORKBOOK_TABS)[number];

export const SOURCE_STATUS_COLUMN = "source_status" as const;
export const PRODUCTION_SOURCE_STATUS = "production" as const;

export const CONTROLLED_LISTS: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(controlledLists, null, 2)};

export const MANUAL_TAB_CONTRACTS: Readonly<Record<ManualWorkbookTab, ManualTabContract>> = {
${tabContractLiterals}
};
`;

// ---- 0001_init.sql -----------------------------------------------------------
const tableStatements = tabNames
  .map((tab) => {
    const tableName = tab.toLowerCase();
    const columns = tabs
      .get(tab)
      .map((column) => `  ${column.header} ${SQL_TYPE_BY_KIND[column.kind]}`)
      .join(",\n");
    return `create table if not exists ${tableName} (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
${columns}
);
create index if not exists ${tableName}_batch_id_idx on ${tableName} (batch_id);`;
  })
  .join("\n\n");

const migrationSource = `-- GENERATED FILE — do not edit by hand.
-- Source of truth: the input workbook's Data_Dictionary (see generate-contracts.mjs).

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null,
  tab_name text not null,
  filename text not null,
  uploaded_at timestamptz not null default now(),
  row_count integer not null,
  issue_count integer not null,
  workbook_state text not null,
  committed boolean not null default true
);

create index if not exists import_batches_tab_uploaded_idx
  on import_batches (tab_name, uploaded_at desc);

create or replace view latest_committed_batches as
  select distinct on (tab_name)
    tab_name,
    id as batch_id,
    upload_id,
    filename,
    uploaded_at,
    row_count
  from import_batches
  where committed
  order by tab_name, uploaded_at desc, id desc;

${tableStatements}
`;

mkdirSync(path.dirname(CONTRACTS_OUT), { recursive: true });
mkdirSync(path.dirname(MIGRATION_OUT), { recursive: true });
writeFileSync(CONTRACTS_OUT, contractsSource);
writeFileSync(MIGRATION_OUT, migrationSource);
console.log(`generated ${tabNames.length} tab contracts`);
console.log(`wrote ${path.relative(projectRoot, CONTRACTS_OUT)}`);
console.log(`wrote ${path.relative(projectRoot, MIGRATION_OUT)}`);
